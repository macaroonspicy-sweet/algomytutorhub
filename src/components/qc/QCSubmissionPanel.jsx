import React, { useEffect, useState } from 'react';
import { useAppAuth } from '@/lib/AppAuthContext';
import { invokeService } from '@/lib/appApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Upload, Loader2, Link2, CalendarDays, CheckCircle2, ExternalLink, History } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, periodLabel, qcPeriodFromDate, todayKey } from '@/lib/workflowUtils';

export default function QCSubmissionPanel() {
  const { currentUser } = useAppAuth();
  const [data, setData] = useState({ submissions: [], tasks: [] });
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState(null);
  const [form, setForm] = useState({ class_date: todayKey(), class_name: '', recording_url: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await invokeService('qcSubmissionService', { action: 'mine' });
      if (res.data?.error) throw new Error(res.data.error);
      setData({ submissions: res.data.submissions || [], tasks: res.data.tasks || [] });
    } catch (err) {
      toast.error('Could not load your QC submissions', { description: err?.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (currentUser?.id) load(); }, [currentUser?.id]);

  const period = qcPeriodFromDate(form.class_date);
  const submittedTaskIds = new Set(
    data.submissions.filter((s) => s.status === 'submitted' && s.task_id).map((s) => s.task_id)
  );
  const openTasks = data.tasks.filter((t) => t.status !== 'completed' && !submittedTaskIds.has(t.id));
  const history = data.submissions.slice(0, 12);

  const startForTask = (t) => {
    setTask(t);
    setForm({ class_date: todayKey(), class_name: t.linked_class_name || '', recording_url: '', notes: '' });
  };

  const submit = async () => {
    if (!form.class_date) { toast.error('Enter the class date'); return; }
    if (!form.recording_url.trim()) { toast.error('Paste the class recording or document link'); return; }
    setSubmitting(true);
    try {
      const res = await invokeService('qcSubmissionService', {
        action: 'submit',
        task_id: task?.id || '',
        class_date: form.class_date,
        class_name: form.class_name,
        recording_url: form.recording_url,
        notes: form.notes,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('QC submission saved', {
        description: `${res.data.period?.period_label || periodLabel(period?.period)} · ${form.class_name || 'class'}`,
      });
      setTask(null);
      setForm({ class_date: todayKey(), class_name: '', recording_url: '', notes: '' });
      load();
    } catch (err) {
      toast.error('Could not submit', { description: err?.response?.data?.error || err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-chart-3" />
          <h2 className="font-semibold text-foreground">QC Submission</h2>
        </div>
        <div className="text-xs text-muted-foreground">
          Submitting as <span className="text-foreground font-medium">{currentUser?.full_name}</span>
          <span className="ml-2 px-1.5 py-0.5 rounded bg-secondary text-[10px]">ID {currentUser?.id?.slice(0, 6)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="space-y-3">
          {task && (
            <div className="flex items-center justify-between gap-2 bg-primary/10 border border-primary/30 rounded-xl px-3 py-2">
              <div className="text-xs text-foreground truncate">Task: {task.title}</div>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setTask(null)}>Clear</Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Class date *</Label>
              <Input
                type="date"
                value={form.class_date}
                onChange={(e) => setForm((f) => ({ ...f, class_date: e.target.value }))}
                className="bg-muted border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Class</Label>
              <Input
                value={form.class_name}
                onChange={(e) => setForm((f) => ({ ...f, class_name: e.target.value }))}
                placeholder="e.g. Class Algebra A"
                className="bg-muted border-border"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs bg-secondary/50 border border-border rounded-xl px-3 py-2">
            <CalendarDays className="w-3.5 h-3.5 text-chart-3" />
            <span className="text-muted-foreground">Assigned period:</span>
            <span className="font-medium text-foreground">
              {period ? `${period.period_label} · ${period.period_month}/${period.period_year}` : 'Pick a date'}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-foreground/80 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Recording / document URL *</Label>
            <Input
              value={form.recording_url}
              onChange={(e) => setForm((f) => ({ ...f, recording_url: e.target.value }))}
              placeholder="https://drive.google.com/..."
              className="bg-muted border-border"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-foreground/80">Notes (optional)</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="bg-muted border-border"
              placeholder="Anything the QC team should know"
            />
          </div>

          <Button onClick={submit} disabled={submitting} className="w-full bg-chart-3/90 hover:bg-chart-3 text-white gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Submit for QC
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Your name and tutor ID come from your account. Only the class date is needed to set the QC period; a recording already submitted for the same class and period is blocked, and a corrected link keeps the earlier version on record.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-foreground">Waiting to submit</h3>
              <span className="text-xs text-muted-foreground">{openTasks.length}</span>
            </div>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : openTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open QC submission tasks.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {openTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 bg-secondary/40 border border-border rounded-xl px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-foreground truncate">{t.title}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {t.linked_class_name || 'No class set'} · due {fmtDate(t.deadline)}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-border" onClick={() => startForTask(t)}>
                      Submit
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <History className="w-3.5 h-3.5 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">My submissions</h3>
            </div>
            {loading ? null : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {history.map((s) => (
                  <div key={s.id} className="bg-secondary/40 border border-border rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-foreground truncate">{s.class_name || 'Class'}</div>
                      <Badge variant="outline" className={s.status === 'superseded'
                        ? 'border-border text-muted-foreground text-[10px]'
                        : 'border-chart-3/40 text-chart-3 text-[10px]'}>
                        {s.status === 'superseded' ? 'Replaced' : <><CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Submitted</>}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {periodLabel(s.period)} {s.period_month}/{s.period_year} · v{s.version || 1} · {fmtDate(s.class_date)} · {s.submitted_at ? new Date(s.submitted_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </div>
                    <a href={s.recording_url} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline inline-flex items-center gap-1 mt-1">
                      <ExternalLink className="w-3 h-3" /> Open link
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}