import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function ExportDialog({ open, onOpenChange, modules = [], filters = {}, defaultModule }) {
  const [selected, setSelected] = useState([defaultModule || modules[0]?.value]);
  const [scope, setScope] = useState('all');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (open) {
      setSelected([defaultModule || modules[0]?.value]);
      setScope('all');
    }
  }, [open, defaultModule, modules]);

  const toggle = (value) => {
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const downloadCSV = (data, filename) => {
    if (!data || !data.length) return;
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map((row) =>
        headers
          .map((fieldName) => {
            const val = row[fieldName] !== null && row[fieldName] !== undefined ? row[fieldName] : '';
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(',')
      )
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = async () => {
    if (!selected.length) {
      toast.error('Choose at least one module to export');
      return;
    }
    setLoading(true);

    try {
      let totalRecords = 0;

      for (const modVal of selected) {
        let records = [];
        let tableName = '';

        // Tentukan tabel Supabase berdasarkan nilai modul
        if (modVal === 'student_feedback' || modVal.includes('student')) {
          tableName = 'FeedbackRecord';
        } else if (modVal === 'weekly_feedback' || modVal.includes('weekly')) {
          tableName = 'WeeklyFeedback';
        }

        if (tableName) {
          let query = supabase.from(tableName).select('*');

          // Jika scope 'filtered', terapkan filter yang sedang aktif
          if (scope === 'filtered') {
            if (filters.search) {
              if (tableName === 'FeedbackRecord') {
                query = query.or(`student_name.ilike.%${filters.search}%,class_code.ilike.%${filters.search}%`);
              } else {
                query = query.or(`class_name.ilike.%${filters.search}%,class_code.ilike.%${filters.search}%,tutor_name.ilike.%${filters.search}%`);
              }
            }
            if (filters.tutor_id && filters.tutor_id !== 'all') {
              query = query.eq('tutor_id', filters.tutor_id);
            }
            if (filters.status && filters.status !== 'all' && tableName === 'WeeklyFeedback') {
              query = query.eq('status', filters.status);
            }
          }

          const { data, error } = await query;
          if (error && error.code !== 'PGRST116') {
            console.error(`Error fetching from ${tableName}:`, error.message);
          } else {
            records = data || [];
          }
        }

        if (records && records.length > 0) {
          totalRecords += records.length;
          const label = modules.find((m) => m.value === modVal)?.label || tableName;
          const fileName = `${label.replace(/\s+/g, '_')}_${Date.now()}.csv`;
          downloadCSV(records, fileName);
        }
      }

      if (totalRecords === 0) {
        toast.error('No records found to export');
        setLoading(false);
        return;
      }

      toast.success('Export completed', { description: `${totalRecords} record(s) downloaded` });
      onOpenChange(false);
    } catch (err) {
      console.error('[Export Error]:', err);
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
                  <Checkbox checked={selected.includes(module.value)} onCheckedChange={() => toggle(module.value)} />
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