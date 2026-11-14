import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAppAuth } from '@/lib/AppAuthContext';
import {
  MessageSquare,
  CalendarClock,
  Loader2,
  Play,
  Users,
  User,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { assignmentStatus, fmtDate } from '@/lib/workflowUtils';
import FeedbackFormDialog from '@/components/feedback/FeedbackFormDialog';

export default function MyWeeklyFeedbackPanel() {
  const { currentUser } = useAppAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [processingTask, setProcessingTask] = useState(null);

  const getRowKey = (item, idx = 0) =>
    item.id || `${item.class_name || item.student_name}-${item.week_start_date}-${idx}`;

  const getEffectiveStatus = (item) => {
    const raw = (item.status || '').toLowerCase().trim();
    if (raw === 'rescheduled' || raw === 'postponed') return 'rescheduled';
    const total = Math.max(Number(item.student_count) || 1, 1);
    const done = Number(item.completed_count) || 0;
    if (raw === 'completed' || item.is_done || done >= total) return 'completed';
    if (raw === 'in_progress' || done > 0) return 'in_progress';
    return assignmentStatus(item);
  };

  const loadMyAssignments = async () => {
    if (!currentUser?.id && !currentUser?.full_name) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('WeeklyFeedbackAssignment')
        .select('*')
        .order('created_date', { ascending: false });

      if (error) throw error;

      if (data) {
        const myData = data.filter((item) => {
          const isMyId = item.tutor_id && String(item.tutor_id) === String(currentUser.id);
          const isMyName =
            item.tutor_name &&
            item.tutor_name.toLowerCase().trim() ===
              (currentUser.full_name || currentUser.name || '').toLowerCase().trim();

          return isMyId || isMyName;
        });

        setAssignments(myData);
      }
    } catch (err) {
      console.error('Error loading My Weekly Feedback Panel:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyAssignments();
  }, [currentUser?.id, currentUser?.full_name]);

  const handleUpdateStatus = async (item, idx, targetStatus) => {
    const key = getRowKey(item, idx);
    setBusyAction(`${key}:${targetStatus}`);

    try {
      const actionAt = new Date().toISOString();
      const actionBy = currentUser?.full_name || currentUser?.name || 'Tutor';
      const isDoneTarget = targetStatus === 'completed';

      let query = supabase
        .from('WeeklyFeedbackAssignment')
        .update({
          status: targetStatus,
          is_done: isDoneTarget,
          completed_by_name: actionBy,
          completed_at: actionAt,
          completed_date: isDoneTarget ? actionAt : null,
          updated_date: actionAt,
        });

      if (item.id) {
        query = query.eq('id', item.id);
      } else {
        if (item.class_name) query = query.eq('class_name', item.class_name);
        if (item.week_start_date) query = query.eq('week_start_date', item.week_start_date);
        if (item.tutor_name) query = query.eq('tutor_name', item.tutor_name);
      }

      const { data: updatedRows, error } = await query.select();
      if (error) throw error;

      if (!updatedRows || updatedRows.length === 0) {
        throw new Error(
          'Data tidak ter-update di database (cek RLS atau kolom id pada tabel WeeklyFeedbackAssignment).'
        );
      }

      toast.success(
        targetStatus === 'rescheduled'
          ? 'Feedback marked as rescheduled'
          : 'Feedback assignment completed'
      );
      await loadMyAssignments();
    } catch (err) {
      toast.error('Failed to update status', { description: err.message });
    } finally {
      setBusyAction('');
    }
  };

  const pendingAssignments = assignments.filter((a) => {
    const st = getEffectiveStatus(a);
    return st !== 'completed' && st !== 'rescheduled';
  });
  const completedAssignments = assignments.filter((a) => getEffectiveStatus(a) === 'completed');
  const rescheduledAssignments = assignments.filter((a) => getEffectiveStatus(a) === 'rescheduled');

  return (
    <>
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-chart-4" />
            <h2 className="font-semibold text-foreground">My Student Feedback</h2>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>
              <strong className="text-foreground">{pendingAssignments.length}</strong> to do
            </span>
            <span>•</span>
            <span className="text-emerald-500 font-medium">{completedAssignments.length} done</span>
            {rescheduledAssignments.length > 0 && (
              <>
                <span>•</span>
                <span className="text-amber-500 font-medium">
                  {rescheduledAssignments.length} rescheduled
                </span>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No weekly feedback assigned yet. Your assigned classes will appear here.
          </div>
        ) : (
          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
            {assignments.map((item, idx) => {
              const st = getEffectiveStatus(item);
              const isDone = st === 'completed';
              const isRescheduled = st === 'rescheduled';
              const isInProgress = st === 'in_progress';
              const isResolved = isDone || isRescheduled;

              const totalKids = Math.max(Number(item.student_count) || 1, 1);
              const doneKids = Math.min(Number(item.completed_count) || 0, totalKids);
              const isGroup = totalKids > 1;

              const key = getRowKey(item, idx);
              const isRowBusy = busyAction.startsWith(`${key}:`);

              return (
                <div
                  key={key}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/40 border border-border/60 rounded-xl p-3.5 hover:bg-secondary/70 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="text-sm font-medium text-foreground flex items-center gap-2 flex-wrap">
                      <span className="truncate">
                        {item.class_name || item.student_name || 'Class Assignment'}
                      </span>

                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-background border border-border text-muted-foreground font-medium">
                        {isGroup ? (
                          <>
                            <Users className="w-3 h-3 text-primary" />
                            Group ({totalKids} Kids)
                          </>
                        ) : (
                          <>
                            <User className="w-3 h-3 text-chart-3" />
                            Private (1 Kid)
                          </>
                        )}
                      </span>

                      {isDone && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          Done ({totalKids}/{totalKids})
                        </span>
                      )}

                      {isInProgress && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-semibold">
                          In Progress ({doneKids}/{totalKids})
                        </span>
                      )}

                      {isRescheduled && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-medium">
                          Rescheduled
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      {[item.course_name, item.class_code, item.notes].filter(Boolean).join(' · ')}
                    </div>

                    {item.week_start_date && (
                      <div className="text-[10px] text-muted-foreground">
                        Week of {fmtDate(item.week_start_date)}
                      </div>
                    )}
                  </div>

                  {!isResolved && (
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <Button
                        size="sm"
                        onClick={() => setProcessingTask(item)}
                        disabled={isRowBusy}
                        className="h-8 px-3 text-xs bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 font-medium"
                      >
                        <Play className="w-3.5 h-3.5" />
                        {isInProgress
                          ? `Continue (${doneKids}/${totalKids})`
                          : 'Process'}
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleUpdateStatus(item, idx, 'rescheduled')}
                        disabled={isRowBusy}
                        className="h-8 px-2.5 text-xs text-amber-600 hover:bg-amber-500/15 hover:text-amber-700 gap-1"
                        title="Mark this week's feedback as rescheduled"
                      >
                        {busyAction === `${key}:rescheduled` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CalendarClock className="w-3.5 h-3.5" />
                        )}
                        Reschedule
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <FeedbackFormDialog
        open={!!processingTask}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setProcessingTask(null);
            loadMyAssignments();
          }
        }}
        processTask={processingTask}
        onSaved={() => {
          setProcessingTask(null);
          toast.success('Student feedback saved & progress updated!');
          loadMyAssignments();
        }}
      />
    </>
  );
}