import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { db } from '@/api/base44Client';

export default function ExportDialog({ open, onOpenChange, modules, filters, defaultModule }) {
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

        // 1. Ambil daftar entitas yang tersedia di db.entities
        const availableEntities = Object.keys(db.entities || {});
        
        // 2. Tentukan nama entitas target berdasarkan kata kunci modVal
        const strVal = String(modVal).toLowerCase();
        let targetEntity = modVal;

        if (strVal.includes('student') || strVal.includes('feedback_records')) {
          targetEntity = availableEntities.find(e => e.toLowerCase().includes('studentfeedback')) || 'StudentFeedback';
        } else if (strVal.includes('weekly')) {
          targetEntity = availableEntities.find(e => e.toLowerCase().includes('weeklyfeedback')) || 'WeeklyFeedback';
        } else if (strVal.includes('task')) {
          targetEntity = availableEntities.find(e => e.toLowerCase().includes('task')) || 'TaskManagement';
        } else if (strVal.includes('qc')) {
          targetEntity = availableEntities.find(e => e.toLowerCase().includes('qc')) || 'QCTutor';
        }

        // 3. Eksekusi pemanggilan ke adapter Supabase
        if (db.entities[targetEntity]) {
          try {
            records = await db.entities[targetEntity].list();
          } catch (e) {
            console.error(`Failed to fetch from ${targetEntity}:`, e);
          }
        }

        // 4. Fallback jika masih kosong: coba panggil entitas apa saja yang memiliki data
        if (!records.length) {
          for (const entKey of availableEntities) {
            try {
              const res = await db.entities[entKey].list();
              if (res && res.length > 0) {
                records = res;
                break;
              }
            } catch (e) {}
          }
        }

        // 5. Unduh file jika data berhasil didapatkan
        if (records && records.length > 0) {
          totalRecords += records.length;
          const label = modules.find((m) => m.value === modVal)?.label || 'Export';
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