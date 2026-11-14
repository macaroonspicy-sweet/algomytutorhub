import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const extractLessonAndMonth = (row) => {
  const rawLesson =
    row['Lesson'] ??
    row['Lesson Number'] ??
    row['lesson'] ??
    row['lesson_number'] ??
    '';

  const rawMonth = String(row['Month'] ?? row['month'] ?? '').trim();
  const rawNotes = String(row['Notes'] ?? row['notes'] ?? '').trim();

  let lessonNum = parseInt(String(rawLesson).replace(/\D/g, ''), 10);
  if ((!lessonNum || isNaN(lessonNum)) && rawNotes) {
    const match = rawNotes.match(/lesson\s*#?\s*(\d+)/i);
    if (match) lessonNum = parseInt(match[1], 10);
  }

  let computedMonth = rawMonth;
  if (!computedMonth && lessonNum > 0) {
    computedMonth = `Month ${Math.ceil(lessonNum / 4)}`;
  }

  return {
    lesson_number: lessonNum > 0 ? lessonNum : null,
    month: computedMonth || null,
  };
};

export default function ImportWeeklyFeedbackDialog({ open, onOpenChange, onImported }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setErrorMsg('');
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          setErrorMsg('File Excel kosong atau format tidak sesuai.');
          setPreviewData([]);
          return;
        }

        const mappedData = rawJson
          .map((row) => {
            const rawCode = row['Class Code'] || row['class_code'] || '';
            const parsedCode = !isNaN(rawCode) && rawCode !== '' ? parseInt(rawCode, 10) : null;
            const { lesson_number, month } = extractLessonAndMonth(row);
            const rawNotes = String(row['Notes'] || row['notes'] || '').trim();
            const finalNotes =
              rawNotes || (lesson_number ? `Lesson ${lesson_number} (${month})` : '');

            return {
              class_code: parsedCode,
              class_name: String(row['Class Code'] || row['Class Name'] || row['class_name'] || '').trim(),
              course_name: String(row['Course Name'] || row['course_name'] || '').trim(),
              tutor_name: String(row['Tutor Name'] || row['tutor_name'] || '').trim(),
              tutor_id: String(row['Tutor ID'] || row['tutor_id'] || '').trim(),
              student_count: parseInt(row['Student Count'] || row['student_count'] || '1', 10) || 1,
              lesson_number,
              month,
              week_start_date: String(row['Week Start'] || row['week_start_date'] || '').trim(),
              week_end_date: String(row['Week End'] || row['week_end_date'] || '').trim(),
              status: String(row['Status'] || row['status'] || 'pending').toLowerCase().trim(),
              notes: finalNotes,
            };
          })
          .filter((item) => item.class_name);

        if (mappedData.length === 0) {
          setErrorMsg('Tidak ada baris data kelas yang valid ditemukan di dalam file.');
        } else {
          setPreviewData(mappedData);
        }
      } catch (err) {
        console.error('Error parsing Excel:', err);
        setErrorMsg('Gagal membaca file Excel. Pastikan format file .xlsx valid.');
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleConfirmImport = async () => {
    if (!previewData.length) {
      toast.error('No valid records to import');
      return;
    }

    setLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const recordsToInsert = previewData.map((item) => ({
        class_code: item.class_code,
        class_name: item.class_name,
        course_name: item.course_name,
        tutor_name: item.tutor_name,
        tutor_id: item.tutor_id || null,
        student_count: item.student_count,
        lesson_number: item.lesson_number,
        month: item.month,
        week_start_date: item.week_start_date || nowIso.slice(0, 10),
        week_end_date: item.week_end_date || nowIso.slice(0, 10),
        status: ['pending', 'completed', 'overdue'].includes(item.status) ? item.status : 'pending',
        notes: item.notes,
        created_date: nowIso,
        updated_date: nowIso,
      }));

      let { error } = await supabase.from('WeeklyFeedbackAssignment').insert(recordsToInsert);

      if (error && /lesson_number|month/i.test(error.message)) {
        const fallbackRecords = recordsToInsert.map(({ lesson_number, month, ...rest }) => rest);
        ({ error } = await supabase.from('WeeklyFeedbackAssignment').insert(fallbackRecords));
      }

      if (error) throw error;

      toast.success('Import Successful', {
        description: `Berhasil mengimpor ${recordsToInsert.length} data monthly student feedback.`
      });

      resetState();
      onOpenChange(false);
      if (onImported) onImported();
    } catch (err) {
      console.error('Import Error:', err);
      toast.error('Import Failed', { description: err.message || 'Gagal menyimpan data ke database.' });
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setPreviewData([]);
    setErrorMsg('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetState(); onOpenChange(v); }}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <FileSpreadsheet className="w-5 h-5 text-chart-3" /> Import monthly student feedback
          </DialogTitle>
          <DialogDescription>
            Upload a filled .xlsx file (supports optional <strong>Lesson</strong> column to auto-assign Month 1, Month 2, etc.).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!file ? (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl p-8 cursor-pointer hover:bg-secondary/40 transition-colors">
              <Upload className="w-8 h-8 text-muted-foreground mb-2" />
              <span className="text-sm font-medium text-foreground">Choose an .xlsx file</span>
              <span className="text-xs text-muted-foreground mt-1">Monthly_Student_Feedback_Template.xlsx</span>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          ) : (
            <div className="bg-secondary/50 border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {file.name}
                </div>
                <Button variant="ghost" size="sm" onClick={resetState} className="h-7 text-xs text-muted-foreground hover:text-foreground">
                  Change File
                </Button>
              </div>

              {previewData.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Found <strong className="text-foreground">{previewData.length}</strong> valid assignment row(s) ready to import.
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="bg-destructive/15 border border-destructive/30 rounded-xl p-3 flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Classes are taken from your existing class records; a class that is not listed yet is added automatically. Existing assignments are never overwritten.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => { resetState(); onOpenChange(false); }} className="border-border">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={loading || !previewData.length}
              className="bg-primary text-primary-foreground gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Import Assignments
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}