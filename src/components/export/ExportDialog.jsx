import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, FileSpreadsheet, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { downloadCsv } from '@/lib/exportUtils';
import * as XLSX from 'xlsx';

const MONTHS_LABEL = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export default function ExportDialog({ open, onOpenChange, modules = [], filters = {}, defaultModule }) {
  const [selected, setSelected] = useState([]);
  const [scope, setScope] = useState('all');
  const [loading, setLoading] = useState(false);

  // Filter internal khusus modal export
  const [exportMonth, setExportMonth] = useState('all');
  const [exportYear, setExportYear] = useState('all');
  const [exportWeek, setExportWeek] = useState('all');

  React.useEffect(() => {
    if (open) {
      const initialVal = defaultModule || (modules[0]?.value ? modules[0].value : 'student_feedback');
      setSelected([initialVal]);
      setScope('all');
      setExportMonth('all');
      setExportYear('all');
      setExportWeek('all');
    }
  }, [open, defaultModule, modules]);

  const toggle = (value) => {
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const exportTutorTasksExcel = async () => {
    let query = supabase
      .from('TutorTask')
      .select('*')
      .order('created_date', { ascending: false });

    if (scope === 'filtered') {
      const tutorId = filters.tutor_id || filters.tutor;
      if (tutorId && tutorId !== 'all' && tutorId !== '') {
        query = query.eq('assigned_tutor_id', tutorId);
      }
      if (filters.status && filters.status !== 'all' && filters.status !== 'overdue') {
        query = query.eq('status', filters.status);
      }
      if (filters.priority && filters.priority !== 'all') {
        query = query.eq('priority', filters.priority);
      }
      if (filters.category && filters.category !== 'all') {
        query = query.eq('category', filters.category);
      }
      if (filters.search && typeof filters.search === 'string' && filters.search.trim() !== '') {
        const q = filters.search.trim();
        query = query.or(`title.ilike.%${q}%,assigned_tutor_name.ilike.%${q}%,description.ilike.%${q}%`);
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    let tasks = data || [];

    // Filter overdue jika scope filtered dan status === 'overdue'
    if (scope === 'filtered' && filters.status === 'overdue') {
      const today = new Date().toISOString().slice(0, 10);
      tasks = tasks.filter(
        (t) => t.deadline && t.deadline < today && !['completed', 'cancelled'].includes(t.status)
      );
    }

    // Filter bulan/tahun dari dropdown modal export (berdasarkan start_date / deadline / created_date)
    if (exportMonth !== 'all' || exportYear !== 'all') {
      tasks = tasks.filter((t) => {
        const refDate = t.start_date || t.deadline || (t.created_date ? t.created_date.slice(0, 10) : '');
        if (!refDate) return false;
        const [y, m] = refDate.split('-');
        if (exportYear !== 'all' && y !== exportYear) return false;
        if (exportMonth !== 'all' && Number(m) !== Number(exportMonth)) return false;
        return true;
      });
    }

    if (tasks.length === 0) return 0;

    // Ambil TaskActivity untuk seluruh task yang ter-export
    const taskIds = tasks.map((t) => t.id);
    const { data: activities } = await supabase
      .from('TaskActivity')
      .select('*')
      .in('task_id', taskIds)
      .order('created_date', { ascending: false });

    const taskTitleMap = Object.fromEntries(tasks.map((t) => [t.id, t.title]));

    // Sheet 1: Tutor Tasks
    const taskRows = tasks.map((t, idx) => ({
      No: idx + 1,
      Title: t.title || '-',
      Category: t.category || '-',
      Priority: t.priority || '-',
      'Assigned Tutor': t.assigned_tutor_name || '-',
      'Assigned By': t.assigned_by_name || '-',
      'Start Date': t.start_date || '-',
      Deadline: t.deadline || '-',
      Status: t.status || '-',
      'Linked Class': t.linked_class_name || '-',
      'Linked Week': t.linked_week_start_date
        ? `${t.linked_week_start_date} s/d ${t.linked_week_end_date || ''}`
        : '-',
      Description: t.description || '-',
      'Progress Notes': t.progress_notes || '-',
      'Completion Notes': t.completion_notes || '-',
      'Revision Note': t.revision_note || '-',
      'Completed At': t.completed_at ? t.completed_at.slice(0, 19).replace('T', ' ') : '-',
    }));

    // Sheet 2: Task History
    const historyRows = (activities || []).map((a, idx) => ({
      No: idx + 1,
      'Task Title': taskTitleMap[a.task_id] || a.task_id || '-',
      Action: a.action || '-',
      'From Status': a.from_status || '-',
      'To Status': a.to_status || '-',
      Note: a.note || '-',
      'Actor Name': a.actor_name || '-',
      'Actor Role': a.actor_role || '-',
      Timestamp: a.created_date ? a.created_date.slice(0, 19).replace('T', ' ') : '-',
    }));

    const workbook = XLSX.utils.book_new();

    const taskSheet = XLSX.utils.json_to_sheet(taskRows);
    taskSheet['!cols'] = [
      { wch: 5 },  // No
      { wch: 32 }, // Title
      { wch: 20 }, // Category
      { wch: 12 }, // Priority
      { wch: 24 }, // Assigned Tutor
      { wch: 22 }, // Assigned By
      { wch: 13 }, // Start Date
      { wch: 13 }, // Deadline
      { wch: 16 }, // Status
      { wch: 22 }, // Linked Class
      { wch: 24 }, // Linked Week
      { wch: 35 }, // Description
      { wch: 28 }, // Progress Notes
      { wch: 28 }, // Completion Notes
      { wch: 25 }, // Revision Note
      { wch: 20 }, // Completed At
    ];
    XLSX.utils.book_append_sheet(workbook, taskSheet, 'Tutor Tasks');

    const historySheet = XLSX.utils.json_to_sheet(
      historyRows.length > 0
        ? historyRows
        : [{ Info: 'No activity history recorded yet.' }]
    );
    historySheet['!cols'] = [
      { wch: 5 },
      { wch: 32 },
      { wch: 18 },
      { wch: 15 },
      { wch: 15 },
      { wch: 35 },
      { wch: 22 },
      { wch: 16 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(workbook, historySheet, 'Task History');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Tutor_Tasks_${dateStr}.xlsx`);

    return tasks.length;
  };

  const handleExport = async () => {
    if (!selected.length) {
      toast.error('Choose at least one module to export');
      return;
    }
    setLoading(true);

    try {
      let totalRecords = 0;

      for (const rawItem of selected) {
        const modVal = typeof rawItem === 'object' && rawItem !== null ? rawItem.value : String(rawItem);
        const strVal = modVal.toLowerCase();

        // Handler khusus Tutor Tasks (Export Excel 2 sheet)
        if (strVal.includes('task')) {
          const count = await exportTutorTasksExcel();
          totalRecords += count;
          continue;
        }

        let tableName = '';
        if (strVal.includes('student') || strVal.includes('record')) {
          tableName = 'FeedbackRecord';
        } else if (strVal.includes('weekly') || strVal.includes('class')) {
          tableName = 'WeeklyFeedbackAssignment';
        }

        if (!tableName) continue;

        let query = supabase.from(tableName).select('*');

        if (scope === 'filtered') {
          if (filters.search && typeof filters.search === 'string' && filters.search.trim() !== '') {
            const q = filters.search.trim();
            if (tableName === 'FeedbackRecord') {
              query = query.or(`student_name.ilike.%${q}%,class_code.ilike.%${q}%,course_name.ilike.%${q}%`);
            } else {
              query = query.or(`class_name.ilike.%${q}%,class_code.ilike.%${q}%,tutor_name.ilike.%${q}%,course_name.ilike.%${q}%`);
            }
          }

          const tutorId = filters.tutor_id || filters.tutor;
          if (tutorId && tutorId !== 'all' && tutorId !== '') {
            query = query.eq('tutor_id', tutorId);
          }
        }

        if (exportMonth !== 'all') {
          if (tableName === 'FeedbackRecord') {
            query = query.eq('record_month', parseInt(exportMonth, 10));
          } else if (tableName === 'WeeklyFeedbackAssignment') {
            const paddedMonth = exportMonth.padStart(2, '0');
            const targetYear = exportYear !== 'all' ? exportYear : new Date().getFullYear();
            query = query
              .gte('week_start_date', `${targetYear}-${paddedMonth}-01`)
              .lte('week_start_date', `${targetYear}-${paddedMonth}-31`);
          }
        }

        if (exportYear !== 'all') {
          if (tableName === 'FeedbackRecord') {
            query = query.eq('record_year', parseInt(exportYear, 10));
          } else if (tableName === 'WeeklyFeedbackAssignment') {
            query = query
              .gte('week_start_date', `${exportYear}-01-01`)
              .lte('week_start_date', `${exportYear}-12-31`);
          }
        }

        if (exportWeek !== 'all' && tableName === 'WeeklyFeedbackAssignment') {
          query = query.eq('week_start_date', exportWeek);
        }

        if (tableName === 'FeedbackRecord') {
          query = query.order('created_date', { ascending: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        let { data, error } = await query;

        if (error && tableName === 'WeeklyFeedbackAssignment') {
          tableName = 'WeeklyFeedback';
          query = supabase.from(tableName).select('*');
          const fallbackRes = await query;
          data = fallbackRes.data;
          error = fallbackRes.error;
        }

        if (error) {
          console.error(`[Supabase Export Error] Table ${tableName}:`, error.message);
          continue;
        }

        if (data && data.length > 0) {
          totalRecords += data.length;
          const matchedMod = modules.find((m) => m.value === modVal);
          const label = matchedMod?.label || tableName;
          const fileName = `${label.replace(/\s+/g, '_')}_${Date.now()}.csv`;

          const headers = Object.keys(data[0]);
          const rows = data.map((item) => headers.map((key) => item[key]));

          downloadCsv(headers, rows, fileName);
        }
      }

      if (totalRecords === 0) {
        toast.error('No records found for the selected export filters');
        setLoading(false);
        return;
      }

      toast.success('Export completed', { description: `${totalRecords} record(s) downloaded` });
      onOpenChange(false);
    } catch (err) {
      console.error('[Export Execution Error]:', err);
      toast.error('Export failed', { description: err.message || 'Error generating export file' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <FileSpreadsheet className="w-5 h-5 text-chart-3" /> Export Data
          </DialogTitle>
          <DialogDescription>Download records you are authorized to access, across every page.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Section Select Modules */}
          <div className="space-y-2">
            <Label className="text-sm text-foreground/80">Modules</Label>
            <div className="space-y-2">
              {modules.map((module) => (
                <label key={module.value} className="flex items-center gap-3 bg-secondary/50 border border-border rounded-xl px-3 py-2.5 cursor-pointer">
                  <Checkbox
                    checked={selected.includes(module.value)}
                    onCheckedChange={() => toggle(module.value)}
                  />
                  <div>
                    <div className="text-sm font-medium text-foreground">{module.label}</div>
                    {module.hint && <div className="text-xs text-muted-foreground">{module.hint}</div>}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Section Filter Waktu (Bulanan & Mingguan) */}
          <div className="space-y-2">
            <Label className="text-sm text-foreground/80 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" /> Filter Period (Optional)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={exportMonth} onValueChange={setExportMonth}>
                <SelectTrigger className="w-full bg-secondary/50 border-border">
                  <SelectValue placeholder="Select Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTHS_LABEL.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={exportYear} onValueChange={setExportYear}>
                <SelectTrigger className="w-full bg-secondary/50 border-border">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Section Scope */}
          <div className="space-y-2">
            <Label className="text-sm text-foreground/80">Scope</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'all', label: 'All records' },
                { value: 'filtered', label: 'Current page filters' }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setScope(option.value)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                    scope === option.value ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">Cancel</Button>
            <Button onClick={handleExport} disabled={loading} className="bg-chart-3/90 hover:bg-chart-3 text-white gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}