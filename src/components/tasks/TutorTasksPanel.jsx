import React, { useEffect, useState } from 'react';
import { useAppAuth } from '@/lib/AppAuthContext';
import { supabase } from '@/lib/supabaseClient';
import { ListChecks, Loader2, AlertTriangle, Clock, ChevronRight } from 'lucide-react';
import TaskDetailDialog from '@/components/tasks/TaskDetailDialog';
import { daysUntil, fmtDate, isTaskOverdue, TASK_STATUS_META } from '@/lib/workflowUtils';

const HIGH_CONTRAST_PRIORITY = {
  Low: 'bg-slate-100 text-slate-700 border-slate-300',
  Medium: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  High: 'bg-orange-100 text-orange-700 border-orange-300',
  Urgent: 'bg-red-100 text-red-700 border-red-300',
};

const HIGH_CONTRAST_STATUS = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-300',
};

export default function TutorTasksPanel() {
  const { currentUser } = useAppAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('TutorTask')
        .select('*')
        .order('created_date', { ascending: false });

      if (error) throw error;
      const items = data || [];

      const mine = items.filter((t) => {
        const currentId = String(currentUser?.id || '').trim().toLowerCase();
        const assignedId = String(t.assigned_tutor_id || '').trim().toLowerCase();
        const matchId = assignedId && currentId && assignedId === currentId;
        const matchName =
          t.assigned_tutor_name?.toLowerCase().trim() ===
          (currentUser?.full_name || currentUser?.name || '').toLowerCase().trim();
        return matchId || matchName;
      });

      setTasks(mine);
    } catch (err) {
      console.error('Error loading tutor tasks:', err);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.id || currentUser?.full_name) {
      load();
    }
  }, [currentUser?.id, currentUser?.full_name]);

  const active = tasks.filter((t) => !['completed', 'cancelled'].includes(t.status));
  const overdue = tasks.filter((t) => isTaskOverdue(t));
  const completed = tasks.filter((t) => t.status === 'completed');
  const upcoming = [...active].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">My Assigned Tasks</h2>
        </div>
        <div className="flex gap-3 text-xs font-medium">
          <span className="text-foreground/75">{active.length} open</span>
          {overdue.length > 0 && (
            <span className="text-destructive font-semibold">{overdue.length} overdue</span>
          )}
          <span className="text-emerald-600 font-semibold">{completed.length} completed</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tasks assigned yet. Tasks assigned by your Team Leader will appear here automatically.
        </p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">All caught up — no open tasks.</p>
          )}
          {upcoming.map((task) => {
            const late = isTaskOverdue(task);
            const left = daysUntil(task.deadline);
            const priorityStyle =
              HIGH_CONTRAST_PRIORITY[task.priority] || HIGH_CONTRAST_PRIORITY.Medium;
            const statusStyle =
              HIGH_CONTRAST_STATUS[task.status] ||
              TASK_STATUS_META[task.status]?.className ||
              'bg-slate-100 text-slate-700 border-slate-300';

            return (
              <button
                key={task.id}
                onClick={() => {
                  setSelected(task);
                  setOpen(true);
                }}
                className="w-full text-left bg-secondary/40 hover:bg-secondary/70 border border-border rounded-xl px-3.5 py-3 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{task.title}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${priorityStyle}`}
                      >
                        {task.priority || 'Medium'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusStyle}`}
                      >
                        {TASK_STATUS_META[task.status]?.label || task.status}
                      </span>
                      <span
                        className={`text-xs flex items-center gap-1 ${
                          late ? 'text-destructive font-semibold' : 'text-foreground/70 font-medium'
                        }`}
                      >
                        {late ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                        {task.deadline
                          ? late
                            ? `Overdue · ${fmtDate(task.deadline)}`
                            : left === 0
                            ? 'Due today'
                            : left === 1
                            ? 'Due tomorrow'
                            : `Due in ${left} days`
                          : 'No deadline'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-foreground/60 flex-shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <TaskDetailDialog
        open={open}
        onOpenChange={setOpen}
        task={selected}
        mode="tutor"
        onChanged={load}
      />
    </div>
  );
}