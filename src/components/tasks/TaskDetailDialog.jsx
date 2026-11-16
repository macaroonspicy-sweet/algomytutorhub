import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, RotateCcw, History, CalendarDays, Link2, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  fmtDate,
  isTaskOverdue,
  PRIORITY_META,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUS_META,
} from '@/lib/workflowUtils';
import { supabase } from '@/lib/supabaseClient';
import { useAppAuth } from '@/lib/AppAuthContext';

const ACTION_LABELS = {
  assigned: 'Assigned',
  reassigned: 'Reassigned',
  status_changed: 'Status changed',
  deadline_changed: 'Deadline changed',
  edited: 'Task details edited',
  revision_requested: 'Revision requested',
  reopened: 'Reopened',
  comment: 'Comment',
  created: 'Created',
  cancelled: 'Cancelled',
};

export default function TaskDetailDialog({ open, onOpenChange, task, mode = 'manage', tutors = [], onChanged }) {
  const { currentUser } = useAppAuth();
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Manager edit states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Student Feedback');
  const [priority, setPriority] = useState('Medium');
  const [linkedClassName, setLinkedClassName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [status, setStatus] = useState('');
  const [deadline, setDeadline] = useState('');
  const [tutorId, setTutorId] = useState('');
  const [revision, setRevision] = useState('');
  const [comment, setComment] = useState('');

  // Tutor states
  const [progress, setProgress] = useState('');
  const [completion, setCompletion] = useState('');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadHistory = async (taskId) => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('TaskActivity')
        .select('*')
        .eq('task_id', taskId)
        .order('created_date', { ascending: false });
      if (error) throw error;
      setHistory(data || []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!open || !task) return;
    setTitle(task.title || '');
    setDescription(task.description || '');
    setCategory(task.category || 'Student Feedback');
    setPriority(task.priority || 'Medium');
    setLinkedClassName(task.linked_class_name || '');
    setStartDate(task.start_date?.slice(0, 10) || '');
    setStatus(task.status || 'pending');
    setDeadline(task.deadline?.slice(0, 10) || '');
    setTutorId(task.assigned_tutor_id || '');
    setRevision('');
    setComment('');
    setProgress(task.progress_notes || '');
    setCompletion(task.completion_notes || '');
    setConfirmDelete(false);
    loadHistory(task.id);
  }, [open, task]);

  const logActivities = async (logs) => {
    if (!logs.length) return;
    const nowIso = new Date().toISOString();
    const actorId = currentUser?.id ? String(currentUser.id) : null;
    const actorName = currentUser?.full_name || currentUser?.name || 'User';
    const actorRole = currentUser?.role || (mode === 'manage' ? 'Team Leader' : 'Tutor');

    const payload = logs.map((l) => ({
      task_id: task.id,
      action: l.action,
      actor_id: actorId,
      actor_name: actorName,
      actor_role: actorRole,
      from_status: l.from_status || null,
      to_status: l.to_status || null,
      note: l.note || null,
      created_date: nowIso,
      updated_date: nowIso,
      created_by_id: actorId,
    }));

    await supabase.from('TaskActivity').insert(payload);
  };

  const saveManager = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (startDate && deadline && deadline < startDate) {
      toast.error('Deadline cannot be before the start date');
      return;
    }

    const updates = {};
    const logs = [];
    const nowIso = new Date().toISOString();
    const detailChanges = [];

    if (title.trim() !== (task.title || '')) {
      updates.title = title.trim();
      detailChanges.push(`Title → "${title.trim()}"`);
    }
    if ((description.trim() || null) !== (task.description || null)) {
      updates.description = description.trim() || null;
      detailChanges.push('Instructions updated');
    }
    if (category !== (task.category || '')) {
      updates.category = category;
      detailChanges.push(`Category → ${category}`);
    }
    if (priority !== (task.priority || '')) {
      updates.priority = priority;
      detailChanges.push(`Priority → ${priority}`);
    }
    if (category === 'QC Submission' && (linkedClassName.trim() || null) !== (task.linked_class_name || null)) {
      updates.linked_class_name = linkedClassName.trim() || null;
      detailChanges.push(`Class → ${linkedClassName.trim() || 'cleared'}`);
    }
    if ((startDate || null) !== (task.start_date?.slice(0, 10) || null)) {
      updates.start_date = startDate || null;
      detailChanges.push(`Start date → ${startDate ? fmtDate(startDate) : 'cleared'}`);
    }

    if (detailChanges.length) {
      logs.push({ action: 'edited', note: detailChanges.join(' · ') });
    }

    if (status && status !== task.status) {
      updates.status = status;
      if (status === 'completed') updates.completed_at = nowIso;
      if (task.status === 'completed' && status !== 'completed') {
        updates.completed_at = null;
        logs.push({ action: 'reopened', from_status: task.status, to_status: status });
      } else {
        logs.push({ action: 'status_changed', from_status: task.status, to_status: status });
      }
    }

    if ((deadline || null) !== (task.deadline?.slice(0, 10) || null)) {
      updates.deadline = deadline || null;
      logs.push({
        action: 'deadline_changed',
        note: deadline ? `New deadline: ${fmtDate(deadline)}` : 'Deadline removed',
      });
    }

    if (tutorId && String(tutorId) !== String(task.assigned_tutor_id)) {
      const targetTutor = tutors.find((t) => String(t.id) === String(tutorId));
      const newTutorName = targetTutor?.full_name || targetTutor?.name || 'Tutor';
      updates.assigned_tutor_id = String(tutorId);
      updates.assigned_tutor_name = newTutorName;
      logs.push({ action: 'reassigned', note: `Reassigned to ${newTutorName}` });
    }

    if (!Object.keys(updates).length) {
      toast.info('Nothing to update');
      return;
    }

    updates.updated_date = nowIso;
    setSaving(true);
    try {
      const { error } = await supabase.from('TutorTask').update(updates).eq('id', task.id);
      if (error) throw error;
      await logActivities(logs);
      toast.success('Task updated');
      await onChanged?.();
      await loadHistory(task.id);
    } catch (err) {
      toast.error('Could not update task', { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    setDeleting(true);
    try {
      // Hapus riwayat aktivitas task terlebih dahulu
      await supabase.from('TaskActivity').delete().eq('task_id', task.id);
      const { error } = await supabase.from('TutorTask').delete().eq('id', task.id);
      if (error) throw error;

      toast.success('Task deleted');
      onOpenChange(false);
      await onChanged?.();
    } catch (err) {
      toast.error('Could not delete task', { description: err.message });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const requestRevision = async () => {
    if (!revision.trim()) {
      toast.error('Describe the revision needed');
      return;
    }
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('TutorTask')
        .update({
          status: 'in_progress',
          revision_requested: true,
          revision_note: revision.trim(),
          updated_date: nowIso,
        })
        .eq('id', task.id);

      if (error) throw error;
      await logActivities([
        {
          action: 'revision_requested',
          from_status: task.status,
          to_status: 'in_progress',
          note: revision.trim(),
        },
      ]);
      setRevision('');
      toast.success('Revision requested');
      await onChanged?.();
      await loadHistory(task.id);
    } catch (err) {
      toast.error('Could not request revision', { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    try {
      await logActivities([{ action: 'comment', note: comment.trim() }]);
      setComment('');
      toast.success('Comment added');
      await loadHistory(task.id);
    } catch (err) {
      toast.error('Could not add comment', { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const saveTutor = async () => {
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const updates = {
        status,
        progress_notes: progress,
        completion_notes: completion,
        updated_date: nowIso,
      };
      if (status === 'completed') {
        updates.completed_at = nowIso;
        updates.revision_requested = false;
      }

      const { error } = await supabase.from('TutorTask').update(updates).eq('id', task.id);
      if (error) throw error;

      const logs = [];
      if (status !== task.status) {
        logs.push({
          action: 'status_changed',
          from_status: task.status,
          to_status: status,
          note: completion.trim() || progress.trim() || null,
        });
      } else if (progress !== (task.progress_notes || '') || completion !== (task.completion_notes || '')) {
        logs.push({
          action: 'comment',
          note: completion.trim() || progress.trim(),
        });
      }

      await logActivities(logs);
      toast.success('Task updated');
      await onChanged?.();
      await loadHistory(task.id);
    } catch (err) {
      toast.error('Could not update task', { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (!task) return null;
  const statusMeta = TASK_STATUS_META[task.status] || TASK_STATUS_META.pending;
  const overdue = isTaskOverdue(task);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <DialogTitle className="text-foreground text-lg leading-snug">{task.title}</DialogTitle>
            {mode === 'manage' && !confirmDelete && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="border-destructive/30 text-destructive hover:bg-destructive/10 gap-1.5 flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            )}
          </div>
        </DialogHeader>

        {mode === 'manage' && confirmDelete && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-destructive font-medium">
              Delete this task permanently for {task.assigned_tutor_name}? This cannot be undone.
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
                className="h-8 text-xs border-border"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={deleting}
                onClick={handleDeleteTask}
                className="h-8 text-xs gap-1.5"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirm Delete
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${statusMeta.className}`}>
              {statusMeta.label}
            </span>
            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${PRIORITY_META[task.priority] || PRIORITY_META.Medium}`}>
              {task.priority}
            </span>
            <span className="px-2 py-0.5 rounded-full border border-border text-[11px] text-muted-foreground">
              {task.category}
            </span>
            {overdue && (
              <span className="px-2 py-0.5 rounded-full border border-destructive/30 bg-destructive/15 text-destructive text-[11px]">
                Overdue
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Tutor</div>
              <div className="text-foreground font-medium">{task.assigned_tutor_name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Assigned by</div>
              <div className="text-foreground font-medium">{task.assigned_by_name || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Start</div>
              <div className="text-foreground">{fmtDate(task.start_date)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Deadline
              </div>
              <div className={overdue ? 'text-destructive font-medium' : 'text-foreground'}>
                {fmtDate(task.deadline)}
              </div>
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

          {mode !== 'manage' && task.description && (
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
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Pencil className="w-3.5 h-3.5 text-primary" /> Edit Task Details
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Title *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-muted border-border" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Instructions</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What needs to be done..."
                  className="bg-muted border-border"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground/80">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="bg-muted border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground/80">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="bg-muted border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {category === 'QC Submission' && (
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground/80">Class</Label>
                  <Input
                    value={linkedClassName}
                    onChange={(e) => setLinkedClassName(e.target.value)}
                    className="bg-muted border-border"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground/80">Start date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-muted border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground/80">Deadline</Label>
                  <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="bg-muted border-border" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground/80">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="bg-muted border-border">
                      <SelectValue />
                    </SelectTrigger>
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
                  <Label className="text-sm text-foreground/80">Assigned tutor</Label>
                  <Select value={tutorId} onValueChange={setTutorId}>
                    <SelectTrigger className="bg-muted border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tutors.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.full_name || t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={saveManager} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save changes
              </Button>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={revision}
                  onChange={(e) => setRevision(e.target.value)}
                  placeholder="Request a revision — describe what must change"
                  className="bg-muted border-border"
                />
                <Button variant="outline" onClick={requestRevision} disabled={saving} className="border-border gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> Request revision
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment for the tutor"
                  className="bg-muted border-border"
                />
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
                  <SelectTrigger className="bg-muted border-border">
                    <SelectValue />
                  </SelectTrigger>
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
                <Textarea
                  value={progress}
                  onChange={(e) => setProgress(e.target.value)}
                  rows={2}
                  className="bg-muted border-border"
                  placeholder="What have you done so far?"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Completion notes</Label>
                <Textarea
                  value={completion}
                  onChange={(e) => setCompletion(e.target.value)}
                  rows={2}
                  className="bg-muted border-border"
                  placeholder="Summary when you complete the task"
                />
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
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
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
                          <span className="text-muted-foreground">
                            {' '}
                            — {TASK_STATUS_META[entry.from_status]?.label || entry.from_status} →{' '}
                            {TASK_STATUS_META[entry.to_status]?.label || entry.to_status}
                          </span>
                        )}
                      </div>
                      {entry.note && <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{entry.note}</div>}
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                        {entry.actor_name} ·{' '}
                        {entry.created_date
                          ? new Date(entry.created_date).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
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