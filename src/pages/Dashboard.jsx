import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Users,
  ShieldCheck,
  Award,
  MessageSquareText,
  ClipboardList,
  BookOpen,
  Play,
  CalendarClock,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

const normalizeKey = (val) =>
  String(val || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

function Dashboard() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [feedbackRecords, setFeedbackRecords] = useState([]);
  const [monthlyAssignments, setMonthlyAssignments] = useState([]);
  const [qcRecords, setQcRecords] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [courses, setCourses] = useState([]);
  const [modules, setModules] = useState([]);

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    profile?.username ||
    user?.email ||
    'User';

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const [
          usersRes,
          fbRes,
          assignRes,
          qcRes,
          tasksRes,
          coursesRes,
          modulesRes,
        ] = await Promise.all([
          supabase.from('CustomUser').select('*'),
          supabase.from('FeedbackRecord').select('*'),
          supabase.from('WeeklyFeedbackAssignment').select('*'),
          supabase.from('QCRecord').select('*'),
          supabase.from('TutorTask').select('*'),
          supabase.from('CourseCategory').select('*'),
          supabase.from('ModuleCategory').select('*'),
        ]);

        if (usersRes.error) throw usersRes.error;
        if (fbRes.error) throw fbRes.error;
        if (assignRes.error) throw assignRes.error;
        if (qcRes.error) throw qcRes.error;
        if (tasksRes.error) throw tasksRes.error;
        if (coursesRes.error) throw coursesRes.error;
        if (modulesRes.error) throw modulesRes.error;

        setUsers(usersRes.data || []);
        setFeedbackRecords((fbRes.data || []).filter((r) => !r.is_sample));
        setMonthlyAssignments((assignRes.data || []).filter((a) => !a.is_sample));
        setQcRecords((qcRes.data || []).filter((q) => !q.is_sample));
        setTasks((tasksRes.data || []).filter((t) => !t.is_sample));
        setCourses((coursesRes.data || []).filter((c) => !c.is_sample));
        setModules((modulesRes.data || []).filter((m) => !m.is_sample));
      } catch (err) {
        toast.error('Failed to load Dashboard', { description: err.message });
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const stats = useMemo(() => {
    const activeUsers = (users || []).filter(
      (u) => u.is_active !== false && !u.is_sample
    );

    // Match User List filter for tutors (role === 'Tutor', active, non-sample)
    const rawTutors = activeUsers.filter(
      (u) => String(u.role || '').trim().toLowerCase() === 'tutor'
    );

    const seenTutors = new Set();
    const tutorList = rawTutors.filter((u) => {
      const key = u.id
        ? String(u.id)
        : normalizeKey(u.email || u.username || u.full_name);
      if (!key || seenTutors.has(key)) return false;
      seenTutors.add(key);
      return true;
    });

    const totalTutors = tutorList.length;
    const totalActiveUsers = activeUsers.length;

    // Feedback analytics
    const totalFeedbackRecords = feedbackRecords.length;
    const ratedFeedback = feedbackRecords.filter(
      (r) => r.rating !== null && r.rating !== undefined && !Number.isNaN(Number(r.rating))
    );
    const avgFeedbackPoint =
      ratedFeedback.length > 0
        ? Number(
            (
              ratedFeedback.reduce((sum, r) => sum + Number(r.rating), 0) /
              ratedFeedback.length
            ).toFixed(1)
          )
        : 4;

    // QC analytics
    const totalQcRecords = qcRecords.length;
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const qcThisMonth = qcRecords.filter((q) => {
      if (q.period_year && q.period_month) {
        return (
          Number(q.period_year) === curYear && Number(q.period_month) === curMonth
        );
      }
      if (!q.record_date) return false;
      const d = new Date(q.record_date);
      return (
        !Number.isNaN(d.getTime()) &&
        d.getFullYear() === curYear &&
        d.getMonth() + 1 === curMonth
      );
    }).length;

    const scoredQc = qcRecords.filter(
      (q) =>
        q.evaluation_score !== null &&
        q.evaluation_score !== undefined &&
        !Number.isNaN(Number(q.evaluation_score))
    );
    const qcResultAvg =
      scoredQc.length > 0
        ? Number(
            (
              scoredQc.reduce((sum, q) => sum + Number(q.evaluation_score), 0) /
              scoredQc.length
            ).toFixed(1)
          )
        : null;

    // Discipline summary (75% feedback completion + 25% meeting attendance)
    const doneAssignments = monthlyAssignments.filter(
      (a) =>
        a.is_done === true ||
        ['completed', 'done', 'submitted'].includes(
          String(a.status || '').toLowerCase().trim()
        )
    ).length;
    const fbPct =
      monthlyAssignments.length > 0
        ? Number(((doneAssignments / monthlyAssignments.length) * 100).toFixed(1))
        : 0;
    const meetPct = 0;
    const disciplinePct = Number((fbPct * 0.75 + meetPct * 0.25).toFixed(1));

    // Assigned tasks for current user
    const myTasks = tasks.filter(
      (t) =>
        (user?.id && t.assigned_to === user.id) ||
        (profile?.id && t.assigned_to === profile.id) ||
        (profile?.full_name &&
          String(t.assigned_to_name || '').toLowerCase() ===
            String(profile.full_name).toLowerCase())
    );
    const openTasks = myTasks.filter(
      (t) => !['completed', 'done'].includes(String(t.status || '').toLowerCase())
    );
    const completedTasks = myTasks.filter((t) =>
      ['completed', 'done'].includes(String(t.status || '').toLowerCase())
    );

    // Monthly student feedback cards
    const sortedMonthly = [...monthlyAssignments].sort((a, b) =>
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );

    const activeCoursesCount = courses.filter((c) => c.is_active !== false).length;
    const totalModulesCount = modules.length;

    return {
      totalTutors,
      totalActiveUsers,
      totalFeedbackRecords,
      avgFeedbackPoint,
      totalQcRecords,
      qcThisMonth,
      qcResultAvg,
      fbPct,
      meetPct,
      disciplinePct,
      myTasks,
      openTasks,
      completedTasks,
      sortedMonthly,
      activeCoursesCount,
      totalModulesCount,
    };
  }, [users, feedbackRecords, monthlyAssignments, qcRecords, tasks, courses, modules, user, profile]);

  const handleRescheduleClick = (item) => {
    toast.info('Reschedule requested', {
      description: `${item.class_name || item.course_name || 'Assignment'} marked for reschedule review.`,
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, {displayName}
        </p>
      </div>

      {/* Top KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Link
          to="/user-list"
          className="bg-card border border-border rounded-2xl p-5 shadow-xs hover:border-primary/40 transition-colors flex items-start justify-between"
        >
          <div>
            <div className="text-3xl font-bold text-foreground tracking-tight">
              {stats.totalTutors}
            </div>
            <div className="text-xs font-semibold text-foreground mt-1">Total Tutors</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {stats.totalActiveUsers} total active users
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </Link>

        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs flex items-start justify-between">
          <div>
            <div className="text-3xl font-bold text-foreground tracking-tight">
              {stats.disciplinePct}%
            </div>
            <div className="text-xs font-semibold text-foreground mt-1">
              Discipline (75/25)
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              FB: {stats.fbPct}% • Meet: {stats.meetPct}%
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs flex items-start justify-between">
          <div>
            <div className="text-3xl font-bold text-foreground tracking-tight">
              {stats.qcResultAvg !== null ? stats.qcResultAvg : '-'}
            </div>
            <div className="text-xs font-semibold text-foreground mt-1">QC Result Avg</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">P1: - • P2: -</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs flex items-start justify-between">
          <div>
            <div className="text-3xl font-bold text-foreground tracking-tight">
              {stats.totalFeedbackRecords}
            </div>
            <div className="text-xs font-semibold text-foreground mt-1">
              Feedback Records
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Avg Point: {stats.avgFeedbackPoint} / 5
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <MessageSquareText className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Middle Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>QC Analytics</span>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">This Month</span>
              <span className="font-bold text-foreground">{stats.qcThisMonth}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Period 1 / Period 2 Avg</span>
              <span className="font-semibold text-primary">- / -</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Records</span>
              <span className="font-bold text-foreground">{stats.totalQcRecords}</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Award className="w-4 h-4 text-amber-500" />
            <span>Feedback Analytics</span>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Average Point</span>
              <span className="font-bold text-amber-600">{stats.avgFeedbackPoint}/5</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Records</span>
              <span className="font-bold text-foreground">
                {stats.totalFeedbackRecords}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <BookOpen className="w-4 h-4 text-primary" />
            <span>Courses & Modules</span>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Active Courses</span>
              <span className="font-bold text-foreground">
                {stats.activeCoursesCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Modules</span>
              <span className="font-bold text-foreground">{stats.totalModulesCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Operational Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* My Assigned Tasks */}
        <div className="lg:col-span-5 bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <ClipboardList className="w-4 h-4 text-primary" />
              <span>My Assigned Tasks</span>
            </div>
            <div className="text-xs font-medium">
              <span className="text-amber-600 font-semibold">
                {stats.openTasks.length} open
              </span>{' '}
              <span className="text-emerald-600 font-semibold ml-1.5">
                {stats.completedTasks.length} completed
              </span>
            </div>
          </div>

          {stats.myTasks.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No tasks assigned yet. Tasks assigned by your Team Leader will appear here
              automatically.
            </div>
          ) : (
            <div className="space-y-2.5">
              {stats.myTasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-border bg-secondary/30 p-3 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-foreground">{task.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Due: {task.due_date || '-'}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-card border border-border font-medium">
                    {task.status || 'Open'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Monthly Student Feedback */}
        <div className="lg:col-span-7 bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <MessageSquareText className="w-4 h-4 text-primary" />
              <span>My Monthly Student Feedback</span>
            </div>
            <div className="text-xs font-medium">
              <span className="text-amber-600 font-semibold">
                {stats.sortedMonthly.filter((i) => !i.is_done).length} to do
              </span>{' '}
              <span className="text-emerald-600 font-semibold ml-1.5">
                {stats.sortedMonthly.filter((i) => i.is_done).length} done
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {stats.sortedMonthly.slice(0, 2).map((item) => {
              const isDone =
                item.is_done === true ||
                ['completed', 'done', 'submitted'].includes(
                  String(item.status || '').toLowerCase().trim()
                );

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">
                        {item.class_name || item.student_name || 'Class Session'}
                      </span>
                      {item.month_label && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-200">
                          {item.month_label}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {item.course_name || 'Course'} •{' '}
                        {item.class_name || item.student_name || ''}
                      </span>
                      <span>•</span>
                      <span>
                        Lesson {item.lesson_number || 4} Monthly Report
                        {item.deadline ? ` | Deadline: ${item.deadline}` : ''}
                      </span>
                    </div>

                    {item.period_label && (
                      <div className="text-[11px] text-muted-foreground">
                        {item.period_label}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isDone ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Done (1/1)
                      </span>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          asChild
                          className="h-8 text-xs font-semibold gap-1.5"
                        >
                          <Link to="/feedback/monthly">
                            <Play className="w-3 h-3 fill-current" />
                            Process
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleRescheduleClick(item)}
                          className="h-8 text-xs font-medium gap-1.5"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          Reschedule
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;