const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from 'react';

import { useAppAuth } from '@/lib/AppAuthContext';
import { Users, Star, MessageSquare, CheckSquare, TrendingUp, BookOpen, Award, FileText, Calendar } from 'lucide-react';
import TutorTasksPanel from '@/components/tasks/TutorTasksPanel';
import MyWeeklyFeedbackPanel from '@/components/weekly-feedback/MyWeeklyFeedbackPanel';
import QCSubmissionPanel from '@/components/qc/QCSubmissionPanel';

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
        // Tutor-specific: show their own evaluations
        statsData.myQcRecords = qcRecs.filter(q => q.tutor_id === currentUser.id).length;
        statsData.myFeedbackRecords = fbRecs.filter(f => f.tutor_id === currentUser.id).length;
      }

      setStats(statsData);
      setLoading(false);
    }
    load();
  }, []);

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