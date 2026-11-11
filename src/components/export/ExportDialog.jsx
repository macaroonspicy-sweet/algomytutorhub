import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { downloadCsv } from '@/lib/exportUtils';

export default function ExportDialog({ open, onOpenChange, modules = [], filters = {}, defaultModule }) {
  const [selected, setSelected] = useState([]);
  const [scope, setScope] = useState('all');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (open) {
      const initialVal = defaultModule || (modules[0]?.value ? modules[0].value : 'student_feedback');
      setSelected([initialVal]);
      setScope('all');
    }
  }, [open, defaultModule, modules]);

  const toggle = (value) => {
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
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
        
        let tableName = '';
        if (strVal.includes('student') || strVal.includes('record')) {
          tableName = 'FeedbackRecord';
        } else if (strVal.includes('weekly') || strVal.includes('class')) {
          tableName = 'WeeklyFeedback';
        }

        if (!tableName) continue;

        let query = supabase.from(tableName).select('*');

        // TERAPKAN FILTER SAAT USER MEMILIH SCOPE 'filtered'
        if (scope === 'filtered' && filters) {
          // 1. Search Query
          if (filters.search && typeof filters.search === 'string' && filters.search.trim() !== '') {
            const q = filters.search.trim();
            if (tableName === 'FeedbackRecord') {
              query = query.or(`student_name.ilike.%${q}%,class_code.ilike.%${q}%,course_name.ilike.%${q}%`);
            } else {
              query = query.or(`class_name.ilike.%${q}%,class_code.ilike.%${q}%,tutor_name.ilike.%${q}%,course_name.ilike.%${q}%`);
            }
          }

          // 2. Filter Tutor
          const tutorId = filters.tutor_id || filters.tutor;
          if (tutorId && tutorId !== 'all' && tutorId !== '') {
            query = query.eq('tutor_id', tutorId);
          }

          // 3. Filter Status (WeeklyFeedback)
          if (tableName === 'WeeklyFeedback' && filters.status && filters.status !== 'all' && filters.status !== '') {
            query = query.eq('status', filters.status);
          }

          // 4. Filter Week (WeeklyFeedback)
          const weekVal = filters.week || filters.week_start;
          if (tableName === 'WeeklyFeedback' && weekVal && weekVal !== 'all' && weekVal !== '') {
            query = query.gte('week_start_date', weekVal);
          }

          // 5. Filter Course
          const courseVal = filters.course || filters.course_name;
          if (courseVal && courseVal !== 'all' && courseVal !== '') {
            query = query.eq('course_name', courseVal);
          }

          // 6. Filter Month & Year (FeedbackRecord)
          if (tableName === 'FeedbackRecord') {
            if (filters.record_month && filters.record_month !== 'all' && filters.record_month !== '') {
              query = query.eq('record_month', parseInt(filters.record_month));
            }
            if (filters.record_year && filters.record_year !== 'all' && filters.record_year !== '') {
              query = query.eq('record_year', parseInt(filters.record_year));
            }
            if (filters.month && filters.month !== 'all' && filters.month !== '') {
              query = query.eq('month', parseInt(filters.month));
            }
          }
        }

        // Urutkan data berdasarkan waktu terbaru
        if (tableName === 'FeedbackRecord') {
          query = query.order('created_date', { ascending: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        const { data, error } = await query;

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
        toast.error('No records found for the applied filters');
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

          <div className="space-y-2">
            <Label className="text-sm text-foreground/80">Scope</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'all', label: 'All records' },
                { value: 'filtered', label: 'Current filters' }
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
            {scope === 'filtered' && (
              <p className="text-xs text-muted-foreground">Only records matching the filters currently applied on this page are exported.</p>
            )}
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