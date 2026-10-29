const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from 'react';

import { useAppAuth } from '@/lib/AppAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, Search, Loader2, FileSpreadsheet, ClipboardList, Clock, CheckCircle2,
  AlertTriangle, CircleDot, ListChecks, CalendarDays, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import TaskFormDialog from '@/components/tasks/TaskFormDialog';
import TaskDetailDialog from '@/components/tasks/TaskDetailDialog';
import ExportDialog from '@/components/export/ExportDialog';
import Pagination from '@/components/ui/Pagination';
import { daysUntil, fmtDate, isTaskOverdue, PRIORITY_META, TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUS_META } from '@/lib/workflowUtils';
import { invokeService } from '@/lib/appApi';

const ITEMS_PER_PAGE = 10;

function StatCard({ label, value, icon: Icon, tone }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-xl font-bold text-foreground">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function Tasks() {
  const { currentUser, hasPermission } = useAppAuth();
  const [tasks, setTasks] = useState([]);
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tutor, setTutor] = useState('all');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('deadline_asc');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const canManage = currentUser?.role === 'Team Leader';
  const canView = hasPermission('task_management');

  const load = async () => {
    try {
      const [res, users] = await Promise.all([
        invokeService('taskService', { action: 'list' }),
        db.entities.CustomUser.list(),
      ]);
      if (res.data?.error) throw new Error(res.data.error);
      setTasks(res.data.items || []);
      setTutors((users || []).filter((u) => ['Tutor', 'Team Leader'].includes(u.role) && u.is_active !== false));
      return res.data.items || [];
    } catch (err) {
      toast.error('Could not load tasks', { description: err?.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (currentUser?.id) load(); }, [currentUser?.id]);

  const filtered = tasks.filter((task) => {
    if (tutor !== 'all' && task.assigned_tutor_id !== tutor) return false;
    if (priority !== 'all' && task.priority !== priority) return false;
    if (category !== 'all' && task.category !== category) return false;
    if (status === 'overdue' && !isTaskOverdue(task)) return false;
    if (status !== 'all' && status !== 'overdue' && task.status !== status) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!`${task.title || ''} ${task.assigned_tutor_name || ''} ${task.description || ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'deadline_asc') return (a.deadline || '9999-12-31').localeCompare(b.deadline || '9999-12-31');
    if (sort === 'deadline_desc') return (b.deadline || '0000-01-01').localeCompare(a.deadline || '0000-01-01');
    if (sort === 'newest') return (b.created_date || '').localeCompare(a.created_date || '');
    return (a.assigned_tutor_name || '').localeCompare(b.assigned_tutor_name || '');
  });

  useEffect(() => { setPage(1); }, [search, tutor, status, priority, category, sort]);

  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginated = sorted.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const count = (predicate) => filtered.filter(predicate).length;
  const total = filtered.length;
  const completedCount = count((t) => t.status === 'completed');
  const completionPct = total ? Math.round((completedCount / total) * 100) : 0;

  const monitoring = Object.values(filtered.reduce((acc, task) => {
    const key = task.assigned_tutor_id || 'unknown';
    if (!acc[key]) {
      acc[key] = { id: key, name: task.assigned_tutor_name || 'Unknown', total: 0, pending: 0, in_progress: 0, completed: 0, need_assistance: 0, overdue: 0 };
    }
    acc[key].total += 1;
    if (task.status === 'need_assistance') acc[key].need_assistance += 1;
    else if (task.status === 'in_progress') acc[key].in_progress += 1;
    else if (task.status === 'completed') acc[key].completed += 1;
    else if (task.status === 'pending') acc[key].pending += 1;
    if (isTaskOverdue(task)) acc[key].overdue += 1;
    return acc;
  }, {})).sort((a, b) => b.total - a.total);

  const openTask = (task) => { setSelected(task); setDetailOpen(true); };
  const openTaskById = (id) => { const found = tasks.find((t) => t.id === id); if (found) openTask(found); };

  if (!canView) {
    return (
      <div className="bg-card border border-border rounded-2xl p-10 text-center">
        <p className="text-muted-foreground">You do not have access to task management.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Task Management</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {canManage ? 'Assign tasks to tutors and monitor progress.' : 'Monitor tutor task progress and completion.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setExportOpen(true)} className="border-border gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </Button>
          {canManage && (
            <Button onClick={() => setFormOpen(true)} className="bg-primary hover:bg-primary/90 gap-2">
              <Plus className="w-4 h-4" /> Create Task
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Total tasks" value={total} icon={ClipboardList} tone="bg-primary/70" />
        <StatCard label="Pending" value={count((t) => t.status === 'pending')} icon={Clock} tone="bg-chart-4/70" />
        <StatCard label="In progress" value={count((t) => t.status === 'in_progress')} icon={CircleDot} tone="bg-accent/70" />
        <StatCard label="Completed" value={completedCount} icon={CheckCircle2} tone="bg-chart-3/70" />
        <StatCard label="Need assistance" value={count((t) => t.status === 'need_assistance')} icon={ListChecks} tone="bg-chart-5/70" />
        <StatCard label="Overdue" value={count((t) => isTaskOverdue(t))} icon={AlertTriangle} tone="bg-destructive/70" />
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground text-sm">Monitoring per tutor</h2>
          <span className="text-xs text-muted-foreground">{completionPct}% overall completion</span>
        </div>
        {monitoring.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks match this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 font-medium">Tutor</th>
                  <th className="py-2 font-medium text-center">Total</th>
                  <th className="py-2 font-medium text-center">Pending</th>
                  <th className="py-2 font-medium text-center">In progress</th>
                  <th className="py-2 font-medium text-center">Completed</th>
                  <th className="py-2 font-medium text-center">Assistance</th>
                  <th className="py-2 font-medium text-center">Overdue</th>
                  <th className="py-2 font-medium">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {monitoring.map((row) => {
                  const pct = row.total ? Math.round((row.completed / row.total) * 100) : 0;
                  return (
                    <tr key={row.id}>
                      <td className="py-2 text-foreground font-medium">{row.name}</td>
                      <td className="py-2 text-center text-muted-foreground">{row.total}</td>
                      <td className="py-2 text-center text-chart-4">{row.pending}</td>
                      <td className="py-2 text-center text-accent">{row.in_progress}</td>
                      <td className="py-2 text-center text-chart-3">{row.completed}</td>
                      <td className="py-2 text-center text-chart-5">{row.need_assistance}</td>
                      <td className="py-2 text-center text-destructive">{row.overdue}</td>
                      <td className="py-2 min-w-[110px]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-chart-3" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-muted-foreground w-8 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search task or tutor..." className="pl-9" />
          </div>
          <Select value={tutor} onValueChange={setTutor}>
            <SelectTrigger className="lg:w-40"><SelectValue placeholder="Tutor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tutors</SelectItem>
              {tutors.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="lg:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="need_assistance">Need Assistance</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="lg:w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priority</SelectItem>
              {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="lg:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {TASK_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="lg:w-40"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="deadline_asc">Deadline (soonest)</SelectItem>
              <SelectItem value="deadline_desc">Deadline (latest)</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="tutor">Tutor name</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground">{filtered.length} of {tasks.length} tasks shown</div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-14"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : paginated.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-muted-foreground">No tasks match this view.</p>
            {canManage && <p className="text-xs text-muted-foreground mt-1">Create a task to get started.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Tutor</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((task) => {
                  const late = isTaskOverdue(task);
                  const left = daysUntil(task.deadline);
                  const meta = TASK_STATUS_META[task.status] || TASK_STATUS_META.pending;
                  return (
                    <tr key={task.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground max-w-[280px] truncate">{task.title}</div>
                        <div className="text-[11px] text-muted-foreground">{task.category}{task.linked_week_start_date ? ' · linked week' : ''}</div>
                      </td>
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">{task.assigned_tutor_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${PRIORITY_META[task.priority] || PRIORITY_META.Medium}`}>{task.priority}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className={`flex items-center gap-1 text-xs ${late ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                          <CalendarDays className="w-3 h-3" /> {fmtDate(task.deadline)}
                        </div>
                        {late ? <div className="text-[10px] text-destructive">Overdue</div> : task.deadline && left !== null && left >= 0 && (
                          <div className="text-[10px] text-muted-foreground">{left === 0 ? 'Due today' : `${left}d left`}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${meta.className}`}>{meta.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="icon" variant="ghost" onClick={() => openTask(task)} className="w-8 h-8 text-muted-foreground hover:text-foreground">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}

      <TaskFormDialog open={formOpen} onOpenChange={setFormOpen} tutors={tutors} onSaved={load} />
      <TaskDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        task={selected}
        mode="manage"
        tutors={tutors}
        onChanged={async () => {
          const items = await load();
          const fresh = items?.find((t) => t.id === selected?.id);
          if (fresh) setSelected(fresh);
        }}
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultModule="tutor_tasks"
        modules={[
          { value: 'tutor_tasks', label: 'Tutor Tasks', hint: 'Tasks plus a separate Task History sheet' },
          { value: 'weekly_feedback', label: 'Weekly Student Feedback', hint: 'Assignments and completion status' },
          { value: 'student_feedback', label: 'Student Feedback Records', hint: 'Recorded feedback with points' },
        ]}
        filters={{
          tutor_id: tutor !== 'all' ? tutor : '',
          status: status !== 'all' ? status : '',
          priority: priority !== 'all' ? priority : '',
          category: category !== 'all' ? category : '',
          search,
        }}
      />
    </div>
  );
}