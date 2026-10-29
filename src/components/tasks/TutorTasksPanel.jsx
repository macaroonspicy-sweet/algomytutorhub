import React, { useEffect, useState } from 'react';
import { useAppAuth } from '@/lib/AppAuthContext';
import { invokeService } from '@/lib/appApi';
import { Button } from '@/components/ui/button';
import { ListChecks, Loader2, AlertTriangle, Clock, ChevronRight } from 'lucide-react';
import TaskDetailDialog from '@/components/tasks/TaskDetailDialog';
import { daysUntil, fmtDate, isTaskOverdue, PRIORITY_META, TASK_STATUS_META } from '@/lib/workflowUtils';

export default function TutorTasksPanel() {
  const { currentUser } = useAppAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await invokeService('taskService', { action: 'list' });
      const mine = (res.data?.items || []).filter((t) => t.assigned_tutor_id === currentUser.id);
      setTasks(mine);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (currentUser?.id) load(); }, [currentUser?.id]);

  const active = tasks.filter((t) => !['completed', 'cancelled'].includes(t.status));
  const overdue = tasks.filter((t) => isTaskOverdue(t));
  const completed = tasks.filter((t) => t.status === 'completed');
  const upcoming = [...active].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">My Tasks</h2>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="text-muted-foreground">{active.length} open</span>
          {overdue.length > 0 && <span className="text-destructive font-medium">{overdue.length} overdue</span>}
          <span className="text-chart-3">{completed.length} completed</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks assigned yet. Tasks from your Team Leader appear here automatically.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">All caught up — no open tasks.</p>}
          {upcoming.map((task) => {
            const late = isTaskOverdue(task);
            const left = daysUntil(task.deadline);
            return (
              <button
                key={task.id}
                onClick={() => { setSelected(task); setOpen(true); }}
                className="w-full text-left bg-secondary/40 hover:bg-secondary/70 border border-border rounded-xl px-3 py-2.5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{task.title}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${PRIORITY_META[task.priority] || PRIORITY_META.Medium}`}>{task.priority}</span>
                      <span className={`px-1.5 py-0.5 rounded-full border text-[10px] ${TASK_STATUS_META[task.status]?.className}`}>{TASK_STATUS_META[task.status]?.label}</span>
                      <span className={`text-[11px] flex items-center gap-1 ${late ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                        {late ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {task.deadline ? (late ? `Overdue · ${fmtDate(task.deadline)}` : left === 0 ? 'Due today' : left === 1 ? 'Due tomorrow' : `Due in ${left} days`) : 'No deadline'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
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