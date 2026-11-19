const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAppAuth } from '@/lib/AppAuthContext';
import {
  Users,
  Star,
  MessageSquare,
  CheckSquare,
  TrendingUp,
  BookOpen,
  Award,
  FileText,
  Calendar,
  CalendarCheck,
  ArrowRight,
} from 'lucide-react';
import TutorTasksPanel from '@/components/tasks/TutorTasksPanel';
import MyWeeklyFeedbackPanel from '@/components/weekly-feedback/MyWeeklyFeedbackPanel';
import QCSubmissionPanel from '@/components/qc/QCSubmissionPanel';

const normalizeName = (name) =>
  (name || '')
    .toLowerCase()
    .replace(/\b(binti|bin|md|mohd|muhammad)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

const isSameTutor = (a, b) => {
  if (!a || !b) return false;
  const cleanA = a.toLowerCase().trim();
  const cleanB = b.toLowerCase().trim();
  if (cleanA === cleanB) return true;
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
  const normA = normalizeName(a);
  const normB = normalizeName(b);
  return normA.length > 4 && normB.length > 4 && (normA.includes(normB) || normB.includes(normA));
};

function StatCard({ label, value, icon: Icon, color, glow }) {
  return (
    <div className={`bg-card border border-border rounded-2xl p-6 flex items-center gap-5 ${glow || ''}`}>
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${color}`}>
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
  const [myMetric, setMyMetric] = useState({
    classesConducted: 0,
    attendancePct: null,
    disciplinePct: null,
    qualityScore: null,
    complaint: '-',
    status: 'No result',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [users, qcRecs, fbRecs, courses, modules] = await Promise.all([
        db.entities.CustomUser.list(),
        hasPermission('qc_records') ? db.entities.QCRecord.list() : [],
        hasPermission('student_feedback') ? db.entities.FeedbackRecord.list() : [],
        hasPermission('category_courses') ? db.entities.CourseCategory.list() : [],
        hasPermission('category_module') ? db.entities.ModuleCategory.list() : [],
      ]);

      const tutors = users.filter((u) => u.role === 'Tutor').length;
      const statsData = {
        totalUsers: users.length,
        tutors,
        admins: users.length - tutors,
        roleCounts: {
          headOfRetention: users.filter((u) => u.role === 'Head of Retention').length,
          headOfTutor: users.filter((u) => u.role === 'Head of Tutor').length,
          qcTeam: users.filter((u) => u.role === 'QC Team').length,
          feedbackTeam: users.filter((u) => u.role === 'Feedback Team').length,
        },
      };

      if (hasPermission('qc_records')) {
        statsData.qcRecords = qcRecs.length;
        const thisMonth = new Date().getMonth() + 1;
        const thisYear = new Date().getFullYear();
        statsData.qcThisMonth = qcRecs.filter(
          (q) => q.period_month === thisMonth && q.period_year === thisYear
        ).length;
        statsData.avgQcScore =
          qcRecs.length > 0
            ? Math.floor(qcRecs.reduce((sum, q) => sum + (q.evaluation_score || 0), 0) / qcRecs.length)
            : 0;
      }

      if (hasPermission('student_feedback')) {
        statsData.feedbackRecords = fbRecs.length;
        statsData.avgFeedbackPoint =
          fbRecs.length > 0
            ? Math.floor(fbRecs.reduce((sum, f) => sum + (f.point || 0), 0) / fbRecs.length)
            : 0;
      }

      if (hasPermission('category_courses')) {
        statsData.totalCourses = courses.filter((c) => c.is_active !== false).length;
      }

      if (hasPermission('category_module')) {
        statsData.totalModules = modules.length;
      }

      if (currentUser?.role === 'Tutor') {
        statsData.myQcRecords = qcRecs.filter((q) => q.tutor_id === currentUser.id).length;
        statsData.myFeedbackRecords = fbRecs.filter((f) => f.tutor_id === currentUser.id).length;
      }

      // Load personal Tutor Metric (Classes Conducted, Attendance %, Discipline %, Quality QC)
      if (['Tutor', 'Team Leader'].includes(currentUser?.role)) {
        try {
          const now = new Date();
          const curMonth = now.getMonth() + 1;
          const curYear = now.getFullYear();
          const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
          const prevYear = curMonth === 1 ? curYear - 1 : curYear;
          const tName = currentUser.full_name || currentUser.username || '';
          const tId = currentUser.id;

          const [{ data: schedData }, { data: qcData }, { data: fbAssignData }, { data: meetData }, { data: attData }] =
            await Promise.all([
              supabase
                .from('BoScheduleRecord')
                .select('lesson_teacher, lesson_month, lesson_year, attendance_pct, is_conducted, is_test_group')
                .eq('lesson_month', curMonth)
                .eq('lesson_year', curYear),
              supabase
                .from('QCRecord')
                .select('tutor_id, tutor_name, period_month, period_year, evaluation_score, is_sample'),
              supabase.from('WeeklyFeedbackAssignment').select('*'),
              supabase.from('TutorMeeting').select('id, meeting_date'),
              supabase.from('TutorMeetingAttendance').select('meeting_id, tutor_id, tutor_name, status'),
            ]);

          // 1. Classes Conducted & Attendance %
          const myConducted = (schedData || []).filter(
            (r) => !r.is_test_group && r.is_conducted && isSameTutor(r.lesson_teacher, tName)
          );
          const classesConducted = myConducted.length;
          const attendancePct =
            classesConducted > 0
              ? Number(
                  (
                    myConducted.reduce((s, r) => s + (Number(r.attendance_pct) || 0), 0) /
                    classesConducted
                  ).toFixed(2)
                )
              : null;

          // 2. Discipline % (Feedback compliance + QC Meeting presence with Ijin = 0.75)
          const myAssignments = (fbAssignData || []).filter((a) => {
            const matchUser = (a.tutor_id && a.tutor_id === tId) || isSameTutor(a.tutor_name, tName);
            if (!matchUser) return false;
            if (a.week_start_date) {
              const [ay, am] = a.week_start_date.split('-');
              return Number(ay) === curYear && Number(am) === curMonth;
            }
            return true;
          });
          const fbTarget = myAssignments.reduce((s, a) => s + (Number(a.student_count) || 1), 0);
          const fbSubmitted = myAssignments.reduce((s, a) => {
            const target = Number(a.student_count) || 1;
            if (a.is_done || (a.status || '').toLowerCase() === 'done') {
              return s + Math.max(Number(a.completed_count) || 0, target);
            }
            return s + Math.min(Number(a.completed_count) || 0, target);
          }, 0);
          const fbPct = fbTarget > 0 ? Math.min(100, (fbSubmitted / fbTarget) * 100) : null;

          const validMeetingIds = new Set(
            (meetData || [])
              .filter((m) => {
                if (!m.meeting_date) return false;
                const [y, mStr] = m.meeting_date.split('-');
                return Number(y) === curYear && Number(mStr) === curMonth;
              })
              .map((m) => m.id)
          );
          const myMeetRecs = (attData || []).filter(
            (att) =>
              validMeetingIds.has(att.meeting_id) &&
              (att.tutor_id === tId || isSameTutor(att.tutor_name, tName))
          );
          let meetPct = null;
          if (myMeetRecs.length > 0) {
            const hadir = myMeetRecs.filter((r) => r.status === 'Hadir').length;
            const ijin = myMeetRecs.filter((r) => r.status === 'Ijin').length;
            meetPct = ((hadir * 1 + ijin * 0.75) / myMeetRecs.length) * 100;
          }

          const discParts = [fbPct, meetPct].filter((v) => v !== null);
          const disciplinePct =
            discParts.length > 0
              ? Number((discParts.reduce((a, b) => a + b, 0) / discParts.length).toFixed(2))
              : null;

          // 3. Quality (QC) from previous month (Default SOP)
          const myQcs = (qcData || []).filter((q) => {
            if (q.is_sample || q.evaluation_score === null || q.evaluation_score === undefined) return false;
            const matchUser = (q.tutor_id && q.tutor_id === tId) || isSameTutor(q.tutor_name, tName);
            return matchUser && Number(q.period_month) === prevMonth && Number(q.period_year) === prevYear;
          });
          const qualityScore =
            myQcs.length > 0
              ? Math.round(myQcs.reduce((s, q) => s + Number(q.evaluation_score || 0), 0) / myQcs.length)
              : null;

          // 4. Overall Status
          const availableMetrics = [attendancePct, disciplinePct, qualityScore].filter((v) => v !== null);
          const composite =
            availableMetrics.length > 0
              ? availableMetrics.reduce((a, b) => a + b, 0) / availableMetrics.length
              : null;

          let status = 'No result';
          if (composite !== null) {
            if (composite >= 90) status = 'High Performer';
            else if (composite >= 80) status = 'Stable Performer';
            else if (composite >= 70) status = 'Need Improvement';
            else status = 'Probation Candidate';
          }

          setMyMetric({
            classesConducted,
            attendancePct,
            disciplinePct,
            qualityScore,
            complaint: '-',
            status,
          });
        } catch (err) {
          console.error('Error loading tutor dashboard metric:', err);
        }
      }

      setStats(statsData);
      setLoading(false);
    }
    load();
  }, [currentUser]);

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
              color="bg-primary"
              glow="glow-purple"
            />
            <StatCard
              label="Total Tutors"
              value={loading ? '...' : stats.tutors || 0}
              icon={BookOpen}
              color="bg-indigo-600"
              glow="glow-cyan"
            />
            {hasQcPermission && (
              <StatCard
                label="QC Records"
                value={loading ? '...' : stats.qcRecords || 0}
                icon={CheckSquare}
                color="bg-chart-3"
              />
            )}
            {hasFeedbackPermission && (
              <StatCard
                label="Feedback Records"
                value={loading ? '...' : stats.feedbackRecords || 0}
                icon={MessageSquare}
                color="bg-chart-4"
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {hasQcPermission && (
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Award className="w-5 h-5 text-chart-3" />
                  <h2 className="font-semibold text-foreground">QC Analytics</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">This Month</span>
                    <span className="text-sm font-bold text-foreground">
                      {loading ? '...' : stats.qcThisMonth || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Average Score</span>
                    <span className="text-sm font-bold text-chart-3">
                      {loading ? '...' : `${stats.avgQcScore || 0} / 100`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Records</span>
                    <span className="text-sm font-bold text-foreground">
                      {loading ? '...' : stats.qcRecords || 0}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {hasFeedbackPermission && (
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-chart-4" />
                  <h2 className="font-semibold text-foreground">Feedback Analytics</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Average Point</span>
                    <span className="text-sm font-bold text-chart-4">
                      {loading ? '...' : `${stats.avgFeedbackPoint || 0} / 5`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Records</span>
                    <span className="text-sm font-bold text-foreground">
                      {loading ? '...' : stats.feedbackRecords || 0}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {(hasPermission('category_courses') || hasPermission('category_module')) && (
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-foreground">Courses &amp; Modules</h2>
                </div>
                <div className="space-y-4">
                  {hasPermission('category_courses') && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Active Courses</span>
                      <span className="text-sm font-bold text-foreground">
                        {loading ? '...' : stats.totalCourses || 0}
                      </span>
                    </div>
                  )}
                  {hasPermission('category_module') && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Modules</span>
                      <span className="text-sm font-bold text-foreground">
                        {loading ? '...' : stats.totalModules || 0}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tutor Dashboard Top KPI Cards + Read-Only Personal Metric Banner */}
      {isTutor && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {hasFeedbackPermission && (
              <StatCard
                label="My Feedback"
                value={loading ? '...' : stats.myFeedbackRecords || 0}
                icon={MessageSquare}
                color="bg-chart-4"
              />
            )}
            <StatCard
              label="My Courses"
              value={loading ? '...' : currentUser?.taught_courses?.length || 0}
              icon={BookOpen}
              color="bg-primary"
            />
            <StatCard
              label="Classes Conducted"
              value={loading ? '...' : myMetric.classesConducted}
              icon={CalendarCheck}
              color="bg-emerald-600"
            />
            <StatCard
              label="My Attendance"
              value={
                loading
                  ? '...'
                  : myMetric.attendancePct !== null
                  ? `${myMetric.attendancePct.toFixed(1)}%`
                  : '-'
              }
              icon={TrendingUp}
              color="bg-indigo-600"
            />
          </div>

          {/* Read-Only Personal Tutor Metric Summary */}
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-3 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-semibold text-foreground text-base flex items-center gap-2">
                  <Award className="w-5 h-5 text-primary" />
                  My Tutor Metric Summary
                </h2>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                  {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })} • Read-Only
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-1">
                <div>
                  <div className="text-xs text-muted-foreground">Classes Conducted</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    {loading ? '...' : myMetric.classesConducted}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Attendance</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    {loading
                      ? '...'
                      : myMetric.attendancePct !== null
                      ? `${myMetric.attendancePct.toFixed(2)}%`
                      : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Discipline</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    {loading
                      ? '...'
                      : myMetric.disciplinePct !== null
                      ? `${myMetric.disciplinePct.toFixed(2)}%`
                      : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Quality (QC)</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    {loading ? '...' : myMetric.qualityScore !== null ? myMetric.qualityScore : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Complaint</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    {loading ? '...' : myMetric.complaint}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-3 border-t lg:border-t-0 pt-3 lg:pt-0 border-border">
              {!loading && (
                <span
                  className={`inline-flex items-center whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
                    myMetric.status === 'High Performer'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : myMetric.status === 'Stable Performer'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : myMetric.status === 'Need Improvement'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : myMetric.status === 'Probation Candidate'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-secondary text-muted-foreground border-border'
                  }`}
                >
                  {myMetric.status}
                </span>
              )}

              <Link
                to="/my-metric"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline whitespace-nowrap"
              >
                View Full Details <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* My Tasks & My Student Feedback (Tutor / Team Leader) */}
      {['Tutor', 'Team Leader'].includes(currentUser?.role) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <TutorTasksPanel />
          <MyWeeklyFeedbackPanel />
        </div>
      )}

      {/* QC submission form — tutor identity comes from the signed-in account */}
      {['Tutor', 'Team Leader'].includes(currentUser?.role) && <QCSubmissionPanel />}

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
              <span className="text-sm font-medium text-foreground">
                {new Date().toLocaleString('default', { month: 'long' })}
              </span>
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