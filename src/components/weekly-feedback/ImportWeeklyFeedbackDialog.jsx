import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { triggerTelegramNotification } from '@/lib/telegramNotifier';

function parseDateSafe(val) {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const str = String(val).replace(/\u00a0/g, ' ').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

const calcMonthFromLesson = (val) => {
  const num = parseInt(String(val || '').replace(/\D/g, ''), 10);
  if (!num || num <= 0) return '';
  return `Month ${Math.ceil(num / 4)}`;
};

function parseLessonNumber(rawLesson, rawNotes) {
  const directDigits = String(rawLesson ?? '').replace(/\D/g, '');
  if (directDigits) return parseInt(directDigits, 10);

  const noteStr = String(rawNotes ?? '');
  const match = noteStr.match(/lesson\s*#?\s*(\d+)/i) || noteStr.match(/\bL(\d+)\b/i);
  if (match && match[1]) return parseInt(match[1], 10);

  return null;
}

export default function ImportWeeklyFeedbackDialog({
  open,
  onOpenChange,
  tutors = [],
  existingAssignments = [],
  onImported,
}) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });

        const mapped = rawData
          .map((r, idx) => {
            const keys = Object.keys(r);
            const findVal = (candidates) => {
              const k = keys.find((key) =>
                candidates.some((c) => key.replace(/\u00a0/g, ' ').toLowerCase().trim() === c.toLowerCase())
              );
              return k ? r[k] : '';
            };

            const classCode = String(
              findVal(['Class Code', 'class_code', 'Class code', 'classCode', 'Kode Kelas']) || ''
            )
              .replace(/\u00a0/g, ' ')
              .trim();
            const rawClassName = String(
              findVal(['Class Name', 'class_name', 'Class', 'Group', 'Nama Kelas']) || ''
            )
              .replace(/\u00a0/g, ' ')
              .trim();

            const finalClassName = rawClassName || classCode;
            const finalClassCode = classCode || rawClassName;

            const courseName = String(
              findVal(['Course Name', 'course_name', 'Course', 'Subject', 'Kursus']) || ''
            )
              .replace(/\u00a0/g, ' ')
              .trim();
            const rawTutor = String(
              findVal(['Tutor Name', 'tutor_name', 'Tutor', 'Teacher', 'Nama Tutor']) || ''
            )
              .replace(/\u00a0/g, ' ')
              .trim();
            const rawTutorId = String(
              findVal(['Tutor ID', 'tutor_id', 'ID Tutor']) || ''
            )
              .replace(/\u00a0/g, ' ')
              .trim();
            const studentCount =
              parseInt(findVal(['Student Count', 'student_count', 'Students', 'Jumlah Siswa']) || '1', 10) || 1;
            const weekStart = parseDateSafe(
              findVal(['Week Start', 'week_start_date', 'Period Start', 'Start Date', 'Start', 'Mulai'])
            );
            const weekEnd = parseDateSafe(
              findVal(['Week End', 'week_end_date', 'Period End', 'End Date', 'End', 'Selesai'])
            );
            const rawNotes = String(findVal(['Notes', 'notes', 'Note', 'Catatan']) || '')
              .replace(/\u00a0/g, ' ')
              .trim();
            const rawLesson = findVal(['Lesson', 'lesson_number', 'Lesson Number', 'Lesson #', 'Pertemuan']);
            const rawMonth = String(findVal(['Month', 'month', 'Bulan']) || '').trim();

            const parsedLesson = parseLessonNumber(rawLesson, rawNotes);
            const computedMonth = rawMonth || calcMonthFromLesson(parsedLesson);
            const finalNotes = rawNotes || (parsedLesson ? `Lesson ${parsedLesson} (${computedMonth})` : '');

            let matchedTutor = null;
            if (rawTutorId) {
              matchedTutor = tutors.find((t) => String(t.id).trim() === rawTutorId);
            }
            if (!matchedTutor && rawTutor) {
              matchedTutor = tutors.find(
                (t) =>
                  (t.full_name || '').toLowerCase().trim() === rawTutor.toLowerCase() ||
                  (t.username || '').toLowerCase().trim() === rawTutor.toLowerCase()
              );
            }

            const targetClassKey = (finalClassName || finalClassCode).toLowerCase().trim();
            const isDuplicate = existingAssignments.some((ex) => {
              const exKey = (ex.class_name || ex.class_code || '').toLowerCase().trim();
              return exKey && targetClassKey && exKey === targetClassKey && (ex.week_start_date || '').slice(0, 10) === weekStart;
            });

            return {
              _idx: idx + 1,
              class_name: finalClassName,
              class_code: finalClassCode,
              course_name: courseName || 'Visual Programming',
              tutor_id: matchedTutor?.id || rawTutorId || '',
              tutor_name: matchedTutor?.full_name || rawTutor || 'Unassigned',
              student_count: studentCount,
              lesson_number: parsedLesson,
              month: computedMonth || null,
              week_start_date: weekStart,
              week_end_date: weekEnd,
              notes: finalNotes,
              _matched: Boolean(matchedTutor),
              _duplicate: isDuplicate,
              _valid: Boolean(finalClassName || finalClassCode),
            };
          })
          .filter((item) => item.class_name || item.class_code || item.tutor_name !== 'Unassigned');

        setRows(mapped);
      } catch (err) {
        toast.error('Failed to read Excel file', { description: err.message });
      }
    };
    reader.readAsBinaryString(file);
    if (e.target) e.target.value = '';
  };

  const validRows = rows.filter((r) => r._valid && !r._duplicate);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const now = new Date().toISOString();
      const payload = validRows.map(({ _idx, _matched, _duplicate, _valid, ...rest }) => ({
        ...rest,
        status: 'pending',
        created_date: now,
        updated_date: now,
      }));

      let { error } = await supabase.from('WeeklyFeedbackAssignment').insert(payload);
      if (error && /lesson_number|month|class_code/i.test(error.message)) {
        const fallbackPayload = payload.map(({ lesson_number, month, class_code, ...rest }) => rest);
        ({ error } = await supabase.from('WeeklyFeedbackAssignment').insert(fallbackPayload));
      }
      if (error) throw error;

      triggerTelegramNotification('monthly_feedback_assigned', payload);

      toast.success(`Imported ${payload.length} monthly feedback assignments!`);
      setRows([]);
      setFileName('');
      onOpenChange(false);
      if (onImported) onImported();
    } catch (err) {
      toast.error('Import failed', { description: err.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Import Monthly Feedback Assignments (Excel / CSV)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-6 text-center cursor-pointer transition-colors bg-secondary/20"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">
              {fileName ? fileName : 'Click to upload Excel (.xlsx, .xls) or CSV file'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supported columns: Class Code, Class Name, Course Name, Tutor Name, Tutor ID, Lesson, Month, Week Start, Week End, Student Count, Notes
            </p>
          </div>

          {rows.length > 0 && (
            <>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                    {validRows.length} Ready to Import
                  </Badge>
                  {rows.filter((r) => r._duplicate).length > 0 && (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                      {rows.filter((r) => r._duplicate).length} Duplicates Skipped
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRows([]);
                    setFileName('');
                  }}
                  className="h-7 text-xs gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </Button>
              </div>

              <div className="border border-border rounded-xl overflow-x-auto max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/60 text-muted-foreground sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Class</th>
                      <th className="text-left px-3 py-2">Course</th>
                      <th className="text-left px-3 py-2">Lesson / Month</th>
                      <th className="text-left px-3 py-2">Tutor</th>
                      <th className="text-left px-3 py-2">Period</th>
                      <th className="text-left px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={r._idx} className={r._duplicate ? 'opacity-50 bg-amber-500/5' : ''}>
                        <td className="px-3 py-2 font-medium">{r.class_name || r.class_code || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.course_name}</td>
                        <td className="px-3 py-2">
                          {r.lesson_number ? (
                            <span className="font-medium text-primary">
                              L{r.lesson_number}{r.month ? ` (${r.month})` : ''}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{r.notes || '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={r._matched ? 'text-foreground' : 'text-amber-500'}>
                            {r.tutor_name}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.week_start_date} → {r.week_end_date}
                        </td>
                        <td className="px-3 py-2">
                          {r._duplicate ? (
                            <span className="inline-flex items-center gap-1 text-amber-500">
                              <AlertCircle className="w-3 h-3" /> Duplicate
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-500">
                              <CheckCircle2 className="w-3 h-3" /> Ready
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={importing || validRows.length === 0}>
            {importing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Import {validRows.length} Assignment{validRows.length === 1 ? '' : 's'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}