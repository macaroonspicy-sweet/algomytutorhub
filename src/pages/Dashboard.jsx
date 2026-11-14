const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAppAuth } from '@/lib/AppAuthContext';
import { Users, Star, MessageSquare, CheckSquare, TrendingUp, BookOpen, Award, FileText, Calendar, CalendarCheck, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TutorTasksPanel from '@/components/tasks/TutorTasksPanel';
import MyWeeklyFeedbackPanel from '@/components/weekly-feedback/MyWeeklyFeedbackPanel';
import QCSubmissionPanel from '@/components/qc/QCSubmissionPanel';

const WEEKS_LIST = [
  'Week 1 (1–7)',
  'Week 2 (8–14)',
  'Week 3 (15–21)',
  'Week 4 (22–End)',
];

const MONTHS_LIST = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

function StatCard({ label, value, icon: Icon, color, glow }) {
  return (
    <div className={`bg-card border border-border rounded-2xl p-6 flex items-center gap-5 ${glow}`}>
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color}`}>
        {Icon && <Icon className="w-6 h-6 text-white" />}
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { currentUser, hasPermission } = useAppAuth();
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  // My Weekly Teaching & Attendance states (Tutor / Team Leader)
  const [myScheduleRecords, setMyScheduleRecords] = useState([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [attMonth, setAttMonth] = useState(String(new Date().getMonth() + 1));
  const [attYear, setAttYear] = useState(String(new Date().getFullYear()));

  const isTutorOrTL = ['Tutor', 'Team Leader'].includes(currentUser?.role);

  useEffect(() => {
    async function load() {
      const [users, qcRecs, fbRecs, courses, modules] = await Promise.all([
        db.entities.CustomUser.list(),
        hasPermission('qc_records') ? db.entities.QCRecord.list() : [],
        hasPermission('student_feedback') ? db.entities.FeedbackRecord.list() : [],
        hasPermission('category_courses') ? db.entities.CourseCategory.list() : [],
        hasPermission('category_module') ? db.entities.ModuleCategory.list() : [],
      ]);

      const tutors = users.filter(u => u.role === 'Tutor').length;
      const statsData = {
        totalUsers: users.length,
        tutors,
        admins: users.length - tutors,
        roleCounts: {
          headOfRetention: users.filter(u => u.role === 'Head of Retention').length,
          headOfTutor: users.filter(u => u.role === 'Head of Tutor').length,
          qcTeam: users.filter(u => u.role === 'QC Team').length,
          feedbackTeam: users.filter(u => u.role === 'Feedback Team').length,
        },
      };

      // QC stats (only if user has permission)
      if (hasPermission('qc_records')) {
        statsData.qcRecords = qcRecs.length;
        const thisMonth = new Date().getMonth() + 1;
        const thisYear = new Date().getFullYear();
        statsData.qcThisMonth = qcRecs.filter(q => q.period_month === thisMonth && q.period_year === thisYear).length;
        statsData.avgQcScore = qcRecs.length > 0 
          ? Math.floor(qcRecs.reduce((sum, q) => sum + (q.evaluation_score || 0), 0) / qcRecs.length)
          : 0;
      }

      // Feedback stats (only if user has permission)
      if (hasPermission('student_feedback')) {
        statsData.feedbackRecords = fbRecs.length;
        statsData.avgFeedbackPoint = fbRecs.length > 0
          ? Math.floor(fbRecs.reduce((sum, f) => sum + (f.point || 0), 0) / fbRecs.length)
          : 0;
      }

      // Course/Module stats
      if (hasPermission('category_courses')) {
        statsData.totalCourses = courses.filter(c => c.is_active !== false).length;
      }

      if (hasPermission('category_module')) {
        statsData.totalModules = modules.length;
      }

      // Role-specific stats
      if (currentUser?.role === 'Tutor') {
        statsData.myQcRecords = qcRecs.filter(q => q.tutor_id === currentUser.id).length;
        statsData.myFeedbackRecords = fbRecs.filter(f => f.tutor_id === currentUser.id).length;
      }

      setStats(statsData);
      setLoading(false);
    }
    load();
  }, []);

  // Load BO Schedule records for the logged-in Tutor / Team Leader
  useEffect(() => {
    if (!isTutorOrTL || !currentUser?.full_name) return;

    async function loadMySchedules() {
      setLoadingSchedules(true);
      try {
        const { data, error } = await supabase
          .from('BoScheduleRecord')
          .select('*')
          .eq('lesson_month', Number(attMonth))
          .eq('lesson_year', Number(attYear));

        if (error) throw error;

        const myName = currentUser.full_name.toLowerCase().trim();
        const mine = (data || []).filter((r) => {
          if (r.is_test_group) return false;
          const teacher = (r.lesson_teacher || '').toLowerCase().trim();
          return teacher && (teacher === myName || teacher.includes(myName) || myName.includes(teacher));
        });

        setMyScheduleRecords(mine);
      } catch (err) {
        console.error('Error loading tutor weekly attendance:', err.message);
      } finally {
        setLoadingSchedules(false);
      }
    }

    loadMySchedules();
  }, [isTutorOrTL, currentUser?.full_name, attMonth, attYear]);

  const weeklyTeachingSummary = useMemo(() => {
    const rows = WEEKS_LIST.map((wk) => {
      const wkRows = myScheduleRecords.filter((r) => r.week_label === wk);
      const conducted = wkRows.filter((r) => r.is_conducted);
      const groupCount = conducted.filter((r) => r.group_type?.toLowerCase() === 'group').length;
      const indivCount = conducted.filter((r) => r.group_type?.toLowerCase() === 'individual').length;
      const intensCount = conducted.filter((r) => r.group_type?.toLowerCase() === 'intensive').length;
      const kidsAttended = conducted.reduce((s, r) => s + (r.students_attended || 0), 0);
      const avgAtt = conducted.length
        ? Math.round(conducted.reduce((s, r) => s + (r.attendance_pct || 0), 0) / conducted.length)
        : 0;

      return {
        week: wk,
        scheduled: wkRows.length,
        conducted: conducted.length,
        groupCount,
        indivCount,
        intensCount,
        kidsAttended,
        avgAtt,
      };
    });

    const totalConducted = rows.reduce((s, r) => s + r.conducted, 0);
    const totalGroup = rows.reduce((s, r) => s + r.groupCount, 0);
    const totalIndiv = rows.reduce((s, r) => s + r.indivCount, 0);
    const totalIntens = rows.reduce((s, r) => s + r.intensCount, 0);
    const totalKids = rows.reduce((s, r) => s + r.kidsAttended, 0);
    const allConductedRows = myScheduleRecords.filter((r) => r.is_conducted);
    const overallAvgAtt = allConductedRows.length
      ? Math.round(allConductedRows.reduce((s, r) => s + (r.attendance_pct || 0), 0) / allConductedRows.length)
      : 0;

    return {
      rows,
      totals: {
        conducted: totalConducted,
        groupCount: totalGroup,
        indivCount: totalIndiv,
        intensCount: totalIntens,
        kidsAttended: totalKids,
        avgAtt: overallAvgAtt,
      },
    };
  }, [myScheduleRecords]);

  const isAdmin = currentUser?.role && !['Tutor'].includes(currentUser.role);
  const isTutor = currentUser?.role === 'Tutor';
  const hasQcPermission = hasPermission('qc_records');
  const hasFeedbackPermission = hasPermission('student_feedback');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back, {currentUser?.full_name || 'User'}</p>
      </div>

      {/* Admin/Management Stats */}
      {isAdmin && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <StatCard 
              label="Total Users" 
              value={loading ? '...' : stats.totalUsers || 0} 
              icon={Users} 
              color="bg-primary/70" 
              glow="glow-purple" 
            />
            <StatCard 
              label="Total Tutors" 
              value={loading ? '...' : stats.tutors || 0} 
              icon={BookOpen} 
              color="bg-accent/70" 
              glow="glow-cyan" 
            />
            {hasQcPermission && (
              <StatCard 
                label="QC Records" 
                value={loading ? '...' : stats.qcRecords || 0} 
                icon={CheckSquare} 
                color="bg-chart-3/70" 
              />
            )}
            {hasFeedbackPermission && (
              <StatCard 
                label="Feedback Records" 
                value={loading ? '...' : stats.feedbackRecords || 0} 
                icon={MessageSquare} 
                color="bg-chart-4/70" 
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* QC Analytics */}
            {hasQcPermission && (
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Award className="w-5 h-5 text-chart-3" />
                  <h2 className="font-semibold text-foreground">QC Analytics</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">This Month</span>
                    <span className="text-sm font-bold text-foreground">{loading ? '...' : stats.qcThisMonth || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Average Score</span>
                    <span className="text-sm font-bold text-chart-3">{loading ? '...' : `${stats.avgQcScore || 0} / 100`}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Records</span>
                    <span className="text-sm font-bold text-foreground">{loading ? '...' : stats.qcRecords || 0}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Feedback Analytics */}
            {hasFeedbackPermission && (
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-chart-4" />
                  <h2 className="font-semibold text-foreground">Feedback Analytics</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Average Point</span>
                    <span className="text-sm font-bold text-chart-4">{loading ? '...' : `${stats.avgFeedbackPoint || 0} / 5`}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Records</span>
                    <span className="text-sm font-bold text-foreground">{loading ? '...' : stats.feedbackRecords || 0}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Course/Module Stats */}
            {(hasPermission('category_courses') || hasPermission('category_module')) && (
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-foreground">Courses & Modules</h2>
                </div>
                <div className="space-y-4">
                  {hasPermission('category_courses') && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Active Courses</span>
                      <span className="text-sm font-bold text-foreground">{loading ? '...' : stats.totalCourses || 0}</span>
                    </div>
                  )}
                  {hasPermission('category_module') && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Modules</span>
                      <span className="text-sm font-bold text-foreground">{loading ? '...' : stats.totalModules || 0}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tutor Dashboard */}
      {isTutor && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {hasQcPermission && (
            <>
              <StatCard 
                label="My QC Records" 
                value={loading ? '...' : stats.myQcRecords || 0} 
                icon={CheckSquare} 
                color="bg-chart-3/70" 
              />
              <StatCard 
                label="Average QC Score" 
                value={loading ? '...' : `${stats.avgQcScore || 0}/100`} 
                icon={Award} 
                color="bg-accent/70" 
              />
            </>
          )}
          {hasFeedbackPermission && (
            <StatCard 
              label="My Feedback" 
              value={loading ? '...' : stats.myFeedbackRecords || 0} 
              icon={MessageSquare} 
              color="bg-chart-4/70" 
            />
          )}
          <StatCard 
            label="My Courses" 
            value={loading ? '...' : (currentUser?.taught_courses?.length || 0)} 
            icon={BookOpen} 
            color="bg-primary/70" 
          />
        </div>
      )}

      {/* My Tasks & My Student Feedback (Tutor / Team Leader) */}
      {isTutorOrTL && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <TutorTasksPanel />
          <MyWeeklyFeedbackPanel />
        </div>
      )}

      {/* My Weekly Teaching & Attendance Recap (Tutor / Team Leader) */}
      {isTutorOrTL && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-foreground">My Weekly Teaching &amp; Attendance</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Weekly breakdown of your conducted lessons and student attendance from BO LMS records.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={attMonth} onValueChange={setAttMonth}>
                <SelectTrigger className="w-[130px] h-9 bg-muted border-border text-xs">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS_LIST.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={attYear} onValueChange={setAttYear}>
                <SelectTrigger className="w-[95px] h-9 bg-muted border-border text-xs">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loadingSchedules ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2.5 font-medium">Week Period</th>
                    <th className="py-2.5 font-medium text-center">Conducted Lessons</th>
                    <th className="py-2.5 font-medium text-center">Group</th>
                    <th className="py-2.5 font-medium text-center">Indiv</th>
                    <th className="py-2.5 font-medium text-center">Intensive</th>
                    <th className="py-2.5 font-medium text-center">Kids Attended</th>
                    <th className="py-2.5 font-medium text-right">Avg Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {weeklyTeachingSummary.rows.map((w) => (
                    <tr key={w.week} className="hover:bg-secondary/30">
                      <td className="py-2.5 font-medium text-foreground">{w.week}</td>
                      <td className="py-2.5 text-center font-semibold text-primary">{w.conducted}</td>
                      <td className="py-2.5 text-center text-muted-foreground">{w.groupCount}</td>
                      <td className="py-2.5 text-center text-muted-foreground">{w.indivCount}</td>
                      <td className="py-2.5 text-center text-muted-foreground">{w.intensCount}</td>
                      <td className="py-2.5 text-center text-foreground">{w.kidsAttended}</td>
                      <td className="py-2.5 text-right font-medium text-chart-3">{w.avgAtt}%</td>
                    </tr>
                  ))}
                  <tr className="bg-secondary/50 font-semibold">
                    <td className="py-3 text-foreground">Total (Month-to-Date)</td>
                    <td className="py-3 text-center text-primary">{weeklyTeachingSummary.totals.conducted}</td>
                    <td className="py-3 text-center text-foreground">{weeklyTeachingSummary.totals.groupCount}</td>
                    <td className="py-3 text-center text-foreground">{weeklyTeachingSummary.totals.indivCount}</td>
                    <td className="py-3 text-center text-foreground">{weeklyTeachingSummary.totals.intensCount}</td>
                    <td className="py-3 text-center text-foreground">{weeklyTeachingSummary.totals.kidsAttended}</td>
                    <td className="py-3 text-right text-chart-3">{weeklyTeachingSummary.totals.avgAtt}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* QC submission form — tutor identity comes from the signed-in account */}
      {isTutorOrTL && <QCSubmissionPanel />}

      {/* Role-based Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isAdmin && (
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-foreground">Team Overview</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Head of Retention</span>
                <span className="text-sm font-medium text-foreground px-2 py-0.5 bg-secondary rounded-lg">
                  {loading ? '...' : stats.roleCounts?.headOfRetention || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Head of Tutor</span>
                <span className="text-sm font-medium text-foreground px-2 py-0.5 bg-secondary rounded-lg">
                  {loading ? '...' : stats.roleCounts?.headOfTutor || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">QC Team</span>
                <span className="text-sm font-medium text-foreground px-2 py-0.5 bg-secondary rounded-lg">
                  {loading ? '...' : stats.roleCounts?.qcTeam || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Feedback Team</span>
                <span className="text-sm font-medium text-foreground px-2 py-0.5 bg-secondary rounded-lg">
                  {loading ? '...' : stats.roleCounts?.feedbackTeam || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Tutor</span>
                <span className="text-sm font-medium text-foreground px-2 py-0.5 bg-secondary rounded-lg">
                  {loading ? '...' : stats.tutors || 0}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-chart-4" />
            <h2 className="font-semibold text-foreground">Current Period</h2>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Month</span>
              <span className="text-sm font-medium text-foreground">{new Date().toLocaleString('default', { month: 'long' })}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Year</span>
              <span className="text-sm font-medium text-foreground">{new Date().getFullYear()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Period</span>
              <span className="text-sm font-medium text-foreground">
                {new Date().getDate() <= 15 ? 'Periode 1 (1-15)' : 'Periode 2 (16-31)'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}