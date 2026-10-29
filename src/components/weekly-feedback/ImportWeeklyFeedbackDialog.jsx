const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState } from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/exportUtils';
import { invokeService } from '@/lib/appApi';

const STATUS_STYLES = {
  valid: 'bg-chart-3/15 text-chart-3 border-chart-3/30',
  invalid: 'bg-destructive/15 text-destructive border-destructive/30',
  duplicate: 'bg-chart-4/15 text-chart-4 border-chart-4/30',
};

export default function ImportWeeklyFeedbackDialog({ open, onOpenChange, onImported }) {
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [fileUri, setFileUri] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setStep('upload');
    setFileName('');
    setFileUri('');
    setPreview(null);
    setResult(null);
    setError('');
    setWorking(false);
  };

  const handleClose = (value) => {
    if (!value) reset();
    onOpenChange(value);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setWorking(true);
    setFileName(file.name);
    try {
      const upload = await db.integrations.Core.UploadPrivateFile({ file });
      const uri = upload.file_uri;
      setFileUri(uri);
      const res = await invokeService('weeklyFeedbackExcel', { action: 'preview', file_uri: uri });
      if (res.data?.error) throw new Error(res.data.error);
      setPreview(res.data);
      setStep('preview');
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
      setStep('upload');
    } finally {
      setWorking(false);
    }
  };

  const handleCommit = async () => {
    setWorking(true);
    try {
      const res = await invokeService('weeklyFeedbackExcel', { action: 'commit', file_uri: fileUri });
      if (res.data?.error) throw new Error(res.data.error);
      setResult(res.data);
      setStep('done');
      onImported?.();
    } catch (err) {
      toast.error('Import failed', { description: err?.response?.data?.error || err.message });
    } finally {
      setWorking(false);
    }
  };

  const downloadErrors = () => {
    const rows = (result?.failed_rows || []).map((r) => [
      r.row || '', r.week_start_date || '', r.week_end_date || '', r.class_name || '', r.class_code || '',
      r.course_name || '', r.tutor_name || '', (r.errors || []).join('; '),
    ]);
    downloadCsv(
      ['Row', 'Week Start', 'Week End', 'Class Name', 'Class Code', 'Course', 'Tutor Name', 'Errors'],
      rows,
      `weekly-class-feedback-import-errors-${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  const summary = preview?.summary;
  const visibleRows = (preview?.rows || []).slice(0, 100);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <FileSpreadsheet className="w-5 h-5 text-chart-3" /> Import weekly class feedback
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a filled .xlsx file — nothing is saved until you confirm.'}
            {step === 'preview' && 'Review the validation results before importing.'}
            {step === 'done' && 'Import finished.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-2xl py-10 cursor-pointer hover:border-primary/60 transition-colors">
              <Upload className="w-7 h-7 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{working ? 'Reading file…' : 'Choose an .xlsx file'}</span>
              <span className="text-xs text-muted-foreground">{fileName || 'Rows are validated before anything is saved'}</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={working}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              {working && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            </label>
            <p className="text-xs text-muted-foreground">
              Classes are taken from your existing class records; a class that is not listed yet is added automatically. Existing assignments are never overwritten.
            </p>
            {error && <div className="bg-destructive/15 text-destructive text-sm rounded-xl px-3 py-2">{error}</div>}
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Rows', value: summary.total, tone: 'text-foreground' },
                { label: 'Valid', value: summary.valid, tone: 'text-chart-3' },
                { label: 'Invalid', value: summary.invalid, tone: 'text-destructive' },
                { label: 'Duplicates', value: summary.duplicate, tone: 'text-chart-4' },
              ].map((item) => (
                <div key={item.label} className="bg-secondary/50 border border-border rounded-xl px-3 py-2.5">
                  <div className={`text-xl font-bold ${item.tone}`}>{item.value}</div>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="border border-border rounded-xl overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/60 sticky top-0">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Class</th>
                      <th className="px-3 py-2 font-medium">Tutor</th>
                      <th className="px-3 py-2 font-medium">Week</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleRows.map((row) => (
                      <tr key={`${row.row}-${row.class_name}`} className="align-top">
                        <td className="px-3 py-2 text-muted-foreground">{row.row}</td>
                        <td className="px-3 py-2 text-foreground">{row.class_name || '—'}<div className="text-[10px] text-muted-foreground">{row.class_code}</div></td>
                        <td className="px-3 py-2 text-foreground">{row.tutor_name || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.week_start_date || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-medium ${STATUS_STYLES[row.status]}`}>
                            {row.status}
                          </span>
                          {row.errors?.length > 0 && <div className="text-[10px] text-destructive mt-1">{row.errors.join(' · ')}</div>}
                          {row.warnings?.length > 0 && <div className="text-[10px] text-chart-4 mt-1">{row.warnings.join(' · ')}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > visibleRows.length && (
                <div className="px-3 py-2 text-[11px] text-muted-foreground bg-secondary/30">Showing first {visibleRows.length} of {preview.rows.length} rows.</div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={reset} className="text-muted-foreground">Choose another file</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleClose(false)} className="border-border">Cancel</Button>
                <Button
                  onClick={handleCommit}
                  disabled={working || summary.valid === 0}
                  className="bg-primary hover:bg-primary/90"
                >
                  {working && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Confirm import ({summary.valid})
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 bg-chart-3/10 border border-chart-3/30 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-chart-3" />
              <div className="text-sm text-foreground">Import completed</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Imported', value: result.imported, tone: 'text-chart-3' },
                { label: 'Skipped', value: result.skipped, tone: 'text-chart-4' },
                { label: 'Failed', value: result.failed, tone: 'text-destructive' },
              ].map((item) => (
                <div key={item.label} className="bg-secondary/50 border border-border rounded-xl px-3 py-3 text-center">
                  <div className={`text-2xl font-bold ${item.tone}`}>{item.value}</div>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
            {result.failed > 0 && (
              <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/25 rounded-xl px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
                <div className="text-sm text-muted-foreground flex-1">Some rows could not be imported.</div>
                <Button size="sm" variant="outline" onClick={downloadErrors} className="border-border gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Error report
                </Button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset} className="border-border">Import another file</Button>
              <Button onClick={() => handleClose(false)} className="bg-primary hover:bg-primary/90">Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}