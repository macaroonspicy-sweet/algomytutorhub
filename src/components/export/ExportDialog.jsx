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
      const initialVal = defaultModule || (modules[0]?.value ? modules[0].value : 'weekly_feedback');
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
        // Mendapatkan string value dari modul terlepas dari bentuk tipe datanya
        const modVal = typeof rawItem === 'object' && rawItem !== null ? rawItem.value : String(rawItem);
        let tableName = '';

        const strVal = modVal.toLowerCase();
        if (strVal.includes('student') || strVal.includes('record')) {
          tableName = 'FeedbackRecord';
        } else if (strVal.includes('weekly') || strVal.includes('class')) {
          tableName = 'WeeklyFeedback';
        }

        if (!tableName) continue;

        // Inisialisasi Query dasar Supabase
        let query = supabase.from(tableName).select('*');

        // HANYA terapkan filter jika scope spesifik memilih 'filtered'
        if (scope === 'filtered') {
          if (filters.search && filters.search.trim() !== '') {
            const q = filters.search.trim();
            if (tableName === 'FeedbackRecord') {
              query = query.or(`student_name.ilike.%${q}%,class_code.ilike.%${q}%`);
            } else {
              query = query.or(`class_name.ilike.%${q}%,class_code.ilike.%${q}%,tutor_name.ilike.%${q}%`);
            }
          }
          if (filters.tutor_id && filters.tutor_id !== 'all') {
            query = query.eq('tutor_id', filters.tutor_id);
          }
          if (filters.status && filters.status !== 'all' && tableName === 'WeeklyFeedback') {
            query = query.eq('status', filters.status);
          }
        }

        // Jalankan Query
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

          // Buat Header & Rows untuk CSV
          const headers = Object.keys(data[0]);
          const rows = data.map((item) => headers.map((key) => item[key]));

          downloadCsv(headers, rows, fileName);
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