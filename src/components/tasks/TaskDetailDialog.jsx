import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, RotateCcw, History, CalendarDays, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, isTaskOverdue, PRIORITY_META, TASK_STATUS_META } from '@/lib/workflowUtils';
import { invokeService } from '@/lib/appApi';

const ACTION_LABELS = {
  assigned: 'Assigned', reassigned: 'Reassigned', status_changed: 'Status changed',
  deadline_changed: 'Deadline changed', revision_requested: 'Revision requested',
  reopened: 'Reopened', comment: 'Comment', created: 'Created', cancelled: 'Cancelled',
};

export default function TaskDetailDialog({ open, onOpenChange, task, mode = 'manage', tutors = [], onChanged }) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [status, setStatus] = useState('');
  const [deadline, setDeadline] = useState('');
  const [tutorId, setTutorId] = useState('');
  const [revision, setRevision] = useState('');
  const [comment, setComment] = useState('');
  const [progress, setProgress] = useState('');
  const [completion, setCompletion] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !task) return;
    setStatus(task.status);
    setDeadline(task.deadline?.slice(0, 10) || '');
    setTutorId(task.assigned_tutor_id || '');
    setRevision('');
    setComment('');
    setProgress(task.progress_notes || '');
    setCompletion(task.completion_notes || '');
    setLoadingHistory(true);
    invokeService('taskService', { action: 'history', task_id: task.id })
      .then((res) => setHistory(res.data?.items || []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [open, task]);

  const refresh = async (message) => {
    toast.success(message);
    await onChanged?.();
    const res = await invokeService('taskService', { action: 'history', task_id: task.id });
    setHistory(res.data?.items || []);
  };

  const run = async (payload, message) => {
    setSaving(true);
    try {
      const res = await invokeService('taskService', payload);
      if (res.data?.error) throw new Error(res.data.error);
      await refresh(message);
      return res.data?.task;
    } catch (err) {
      toast.error('Could not update task', { description: err?.response?.data?.error || err.message });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveManager = async () => {
    const fields = {};
    if (status !== task.status) fields.status = status;
    if (deadline && deadline !== (task.deadline?.slice(0, 10) || '')) fields.deadline = deadline;
    const payload = { action: 'update', task_id: task.id, fields };
    if (tutorId && tutorId !== task.assigned_tutor_id) payload.tutor_id = tutorId;
    if (!Object.keys(fields).length && !payload.tutor_id) { toast.info('Nothing to update'); return; }
    await run(payload, 'Task updated');
  };

  const requestRevision = async () => {
    if (!revision.trim()) { toast.error('Describe the revision needed'); return; }
    await run({ action: 'update', task_id: task.id, revision_note: revision.trim() }, 'Revision requested');
    setRevision('');
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    await run({ action: 'update', task_id: task.id, comment: comment.trim() }, 'Comment added');
    setComment('');
  };

  const saveTutor = async () => {
    await run({
      action: 'updateMine',
      task_id: task.id,
      status,
      progress_notes: progress,
      completion_notes: completion,
    }, 'Task updated');
  };

  if (!task) return null;
  const statusMeta = TASK_STATUS_META[task.status] || TASK_STATUS_META.pending;
  const overdue = isTaskOverdue(task);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground text-lg leading-snug">{task.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${statusMeta.className}`}>{statusMeta.label}</span>
            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${PRIORITY_META[task.priority] || PRIORITY_META.Medium}`}>{task.priority}</span>
            <span className="px-2 py-0.5 rounded-full border border-border text-[11px] text-muted-foreground">{task.category}</span>
            {overdue && <span className="px-2 py-0.5 rounded-full border border-destructive/30 bg-destructive/15 text-destructive text-[11px]">Overdue</span>}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Tutor</div><div className="text-foreground font-medium">{task.assigned_tutor_name}</div></div>
            <div><div className="text-xs text-muted-foreground">Assigned by</div><div className="text-foreground font-medium">{task.assigned_by_name || '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Start</div><div className="text-foreground">{fmtDate(task.start_date)}</div></div>
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Deadline</div>
              <div className={overdue ? 'text-destructive font-medium' : 'text-foreground'}>{fmtDate(task.deadline)}</div>
            </div>
            {task.linked_class_name && (
              <div className="col-span-2 flex items-center gap-1.5 text-xs text-chart-3">
                <Link2 className="w-3 h-3" /> Class: {task.linked_class_name}
              </div>
            )}
            {task.linked_week_start_date && (
              <div className="col-span-2 flex items-center gap-1.5 text-xs text-accent">
                <Link2 className="w-3 h-3" /> Linked feedback week: {fmtDate(task.linked_week_start_date)} – {fmtDate(task.linked_week_end_date)}
              </div>
            )}
          </div>

          {task.description && (
            <div className="bg-secondary/40 border border-border rounded-xl p-3">
              <div className="text-xs text-muted-foreground mb-1">Instructions</div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {task.revision_requested && task.revision_note && (
            <div className="bg-destructive/10 border border-destructive/25 rounded-xl p-3">
              <div className="text-xs text-destructive font-medium mb-1">Revision requested</div>
              <p className="text-sm text-foreground">{task.revision_note}</p>
            </div>
          )}

          {mode === 'manage' ? (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground/80">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="need_assistance">Need Assistance</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground/80">Deadline</Label>
                  <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="bg-muted border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground/80">Reassign to</Label>
                  <Select value={tutorId} onValueChange={setTutorId}>
                    <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {tutors.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={saveManager} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save changes
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="Request a revision — describe what must change" className="bg-muted border-border" />
                <Button variant="outline" onClick={requestRevision} disabled={saving} className="border-border gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> Request revision
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment for the tutor" className="bg-muted border-border" />
                <Button variant="outline" onClick={addComment} disabled={saving} className="border-border gap-1.5">
                  <Send className="w-3.5 h-3.5" /> Comment
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Your status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="need_assistance">Need Assistance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Progress notes</Label>
                <Textarea value={progress} onChange={(e) => setProgress(e.target.value)} rows={2} className="bg-muted border-border" placeholder="What have you done so far?" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Completion notes</Label>
                <Textarea value={completion} onChange={(e) => setCompletion(e.target.value)} rows={2} className="bg-muted border-border" placeholder="Summary when you complete the task" />
              </div>
              <Button onClick={saveTutor} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save progress
              </Button>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">History</span>
            </div>
            {loadingHistory ? (
              <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <ol className="space-y-3">
                {history.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-foreground">
                        <span className="font-medium">{ACTION_LABELS[entry.action] || entry.action}</span>
                        {entry.from_status && entry.to_status && (
                          <span className="text-muted-foreground"> — {TASK_STATUS_META[entry.from_status]?.label || entry.from_status} → {TASK_STATUS_META[entry.to_status]?.label || entry.to_status}</span>
                        )}
                      </div>
                      {entry.note && <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{entry.note}</div>}
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                        {entry.actor_name} · {new Date(entry.created_date).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}