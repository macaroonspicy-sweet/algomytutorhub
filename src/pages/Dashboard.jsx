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
 ShieldCheck,
 ArrowRight,
} from 'lucide-react';
import TutorTasksPanel from '@/components/tasks/TutorTasksPanel';
import MyWeeklyFeedbackPanel from '@/components/weekly-feedback/MyWeeklyFeedbackPanel';
import QCSubmissionPanel from '@/components/qc/QCSubmissionPanel';


const FEEDBACK_WEIGHT = 0.75;
const MEETING_WEIGHT = 0.25;


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


const normalizeAttendanceStatus = (status) => {
 const val = String(status || '').trim().toLowerCase();
 if (val === 'present') return 'Present';
 if (val === 'excused') return 'Excused';
 return 'Absent';
};


const isLessonFourMultiple = (assignment) => {
 if (assignment.lesson_number !== null && assignment.lesson_number !== undefined) {
   const num = Number(assignment.lesson_number);
   return !Number.isNaN(num) && num > 0 && num % 4 === 0;
 }
 const match = String(assignment.notes || '').match(/lesson\s*(\d+)/i);
 if (match) {
   const num = Number(match[1]);
   return !Number.isNaN(num) && num > 0 && num % 4 === 0;
 }
 return true;
};


const isAssignmentCompleted = (assignment) =>
 assignment.is_done === true ||
 ['completed', 'done'].includes(String(assignment.status || '').toLowerCase());


const parseEnrolledCount = (r) => {
 const direct = Number(r.students_count);
 if (!Number.isNaN(direct) && direct > 0) return direct;
 const rawMatch = String(r.students_raw || '').match(/^(\d+)/);
 if (rawMatch) {
   const parsed = Number(rawMatch[1]);
   if (parsed > 0) return parsed;
 }
 const attended = Number(r.students_attended) || 0;
 const pct = Number(r.attendance_pct) || 0;
 if (attended > 0 && pct > 0) return Math.round((attended * 100) / pct);
 return attended;
};


function StatCard({ label, value, subtext, icon: Icon, color, glow }) {
 return (
   <div className={`bg-card border border-border rounded-2xl p-6 flex items-center gap-5 ${glow || ''}`}>
     <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${color}`}>
       {Icon && <Icon className="w-6 h-6 text-white" />}
     </div>
     <div className="min-w-0">
       <div className="text-2xl font-bold text-foreground">{value}</div>
       <div className="text-sm text-muted-foreground mt-0.5 truncate">{label}</div>
       {subtext && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtext}</div>}
     </div>
   </div>
 );
}


export default function Dashboard() {
 const { currentUser, hasPermission } = useAppAuth();
 const [stats, setStats] = useState({});
 const [adminKpi, setAdminKpi] = useState({
   disciplineAvg: null,
   fbAvg: null,
   meetAvg: null,
   qcMonthAvg: null,
   qcP1Avg: null,
   qcP2Avg: null,
 });
 const [myMetric, setMyMetric] = useState({
   classesConducted: 0,
   attendancePct: null,
   totalAttendedStudents: 0,
   totalEnrolledStudents: 0,
   disciplinePct: null,
   qualityScore: null,
   complaint: '-',
   status: 'No result',
 });
 const [loading, setLoading] = useState(true);


 const isAdmin = currentUser?.role && !['Tutor'].includes(currentUser.role);
 const isTutor = currentUser?.role === 'Tutor';


 useEffect(() => {
   async function load() {
     const now = new Date();
     const curMonth = now.getMonth() + 1;
     const curYear = now.getFullYear();
     const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
     const prevYear = curMonth === 1 ? curYear - 1 : curYear;

     const [
       { data: supaUsers },
       qcRecs,
       fbRecs,
       courses,
       modules,
     ] = await Promise.all([
       supabase.from('CustomUser').select('*'),
       hasPermission('qc_records') ? db.entities.QCRecord.list() : [],
       hasPermission('student_feedback') ? db.entities.FeedbackRecord.list() : [],
       hasPermission('category_courses') ? db.entities.CourseCategory.list() : [],
       hasPermission('category_module') ? db.entities.ModuleCategory.list() : [],
     ]);

     const users = Array.isArray(supaUsers) ? supaUsers : [];
     const tutors = users.filter(
       (u) => String(u?.role || '').trim().toLowerCase() === 'tutor'
     ).length;

     const statsData = {
       totalUsers: users.length,
       tutors,
       admins: Math.max(0, users.length - tutors),
       roleCounts: {
         headOfTutor: users.filter((u) => u?.role === 'Head of Tutor').length,
         teamLeader: users.filter((u) => u?.role === 'Team Leader').length,
         qcTeam: users.filter((u) => u?.role === 'QC Team').length,
         feedbackTeam: users.filter((u) => u?.role === 'Feedback Team').length,
       },
     };


     if (hasPermission('qc_records')) {
       statsData.qcRecords = qcRecs.length;
       statsData.qcThisMonth = qcRecs.filter(
         (q) => Number(q.period_month) === curMonth && Number(q.period_year) === curYear
       ).length;
       const validQcScores = qcRecs.filter(
         (q) => q.evaluation_score !== null && q.evaluation_score !== undefined && !Number.isNaN(Number(q.evaluation_score))
       );
       statsData.avgQcScore =
         validQcScores.length > 0
           ? Number(
               (validQcScores.reduce((sum, q) => sum + Number(q.evaluation_score), 0) / validQcScores.length).toFixed(1)
             )
           : 0;
     }


     if (hasPermission('student_feedback')) {
       statsData.feedbackRecords = fbRecs.length;
       const ratedFb = fbRecs.filter((f) => {
         const val = f.point ?? f.rating;
         return val !== null && val !== undefined && !Number.isNaN(Number(val));
       });
       statsData.avgFeedbackPoint =
         ratedFb.length > 0
           ? Number(
               (ratedFb.reduce((sum, f) => sum + Number(f.point ?? f.rating), 0) / ratedFb.length).toFixed(1)
             )
           : 0;
     }


     if (hasPermission('category_courses')) {
       statsData.totalCourses = courses.filter((c) => c.is_active !== false).length;
     }


     if (hasPermission('category_module')) {
       statsData.totalModules = modules.length;
     }


     if (isTutor && currentUser) {
       statsData.myQcRecords = qcRecs.filter((q) => q.tutor_id === currentUser.id).length;
       statsData.myFeedbackRecords = fbRecs.filter((f) => f.tutor_id === currentUser.id).length;
     }


     // 1. Query khusus Admin / Team Leader
     if (isAdmin) {
       try {
         const [{ data: qcData }, { data: fbAssignData }, { data: meetData }, { data: attData }] =
           await Promise.all([
             supabase
               .from('QCRecord')
               .select('period_month, period_year, evaluation_score, evaluation_date, created_at, period'),
             supabase.from('WeeklyFeedbackAssignment').select('*'),
             supabase.from('TutorMeeting').select('id, meeting_date'),
             supabase.from('TutorMeetingAttendance').select('meeting_id, status'),
           ]);


         const curAssignments = (fbAssignData || []).filter((a) => {
           if (a.is_sample) return false;
           if (String(a.status || '').toLowerCase() === 'rescheduled') return false;
           if (!isLessonFourMultiple(a)) return false;
           if (a.week_start_date) {
             const [ay, am] = a.week_start_date.split('-');
             return Number(ay) === curYear && Number(am) === curMonth;
           }
           return true;
         });


         const allFbPct =
           curAssignments.length > 0
             ? Number(
                 ((curAssignments.filter(isAssignmentCompleted).length / curAssignments.length) * 100).toFixed(1)
               )
             : null;


         const curMeetingIds = new Set(
           (meetData || [])
             .filter((m) => {
               if (!m.meeting_date) return false;
               const [y, mStr] = m.meeting_date.split('-');
               return Number(y) === curYear && Number(mStr) === curMonth;
             })
             .map((m) => m.id)
         );
         const curMeetAtts = (attData || []).filter((att) => curMeetingIds.has(att.meeting_id));
         let allMeetPct = null;
         if (curMeetAtts.length > 0) {
           const p = curMeetAtts.filter((r) => normalizeAttendanceStatus(r.status) === 'Present').length;
           const e = curMeetAtts.filter((r) => normalizeAttendanceStatus(r.status) === 'Excused').length;
           allMeetPct = Number((((p * 1 + e * 0.75) / curMeetAtts.length) * 100).toFixed(1));
         }


         let allDisciplinePct = null;
         if (allFbPct !== null && allMeetPct !== null) {
           allDisciplinePct = Number((allFbPct * FEEDBACK_WEIGHT + allMeetPct * MEETING_WEIGHT).toFixed(1));
         } else if (allFbPct !== null) {
           allDisciplinePct = allFbPct;
         } else if (allMeetPct !== null) {
           allDisciplinePct = allMeetPct;
         }


         const curMonthQcs = (qcData || []).filter(
           (q) =>
             q.evaluation_score !== null &&
             q.evaluation_score !== undefined &&
             Number(q.period_month) === curMonth &&
             Number(q.period_year) === curYear
         );
         const p1Qcs = curMonthQcs.filter((q) => {
           const p = String(q.period || q.qc_period || '').toLowerCase();
           if (p.includes('1') && !p.includes('2')) return true;
           const day = Number(String(q.evaluation_date || q.created_at || '').split('-')[2] || 1);
           return day <= 15;
         });
         const p2Qcs = curMonthQcs.filter((q) => {
           const p = String(q.period || q.qc_period || '').toLowerCase();
           if (p.includes('2')) return true;
           const day = Number(String(q.evaluation_date || q.created_at || '').split('-')[2] || 16);
           return day > 15;
         });


         const avgScore = (arr) =>
           arr.length > 0
             ? Number((arr.reduce((s, x) => s + Number(x.evaluation_score || 0), 0) / arr.length).toFixed(1))
             : null;


         setAdminKpi({
           disciplineAvg: allDisciplinePct,
           fbAvg: allFbPct,
           meetAvg: allMeetPct,
           qcMonthAvg: avgScore(curMonthQcs),
           qcP1Avg: avgScore(p1Qcs),
           qcP2Avg: avgScore(p2Qcs),
         });
       } catch (err) {
         console.error('Error loading admin dashboard KPIs:', err);
       }
     }


     // 2. Query khusus Tutor (tampilan tetap seperti semula)
     if (isTutor && currentUser) {
       try {
         const tName = currentUser.full_name || currentUser.username || '';
         const tId = currentUser.id;


         const [{ data: schedData }, { data: qcData }, { data: fbAssignData }, { data: meetData }, { data: attData }] =
           await Promise.all([
             supabase
               .from('BoScheduleRecord')
               .select('lesson_teacher, lesson_month, lesson_year, attendance_pct, students_count, students_raw, students_attended, is_conducted, is_test_group')
               .eq('lesson_month', curMonth)
               .eq('lesson_year', curYear),
             supabase
               .from('QCRecord')
               .select('tutor_id, tutor_name, period_month, period_year, evaluation_score, is_sample'),
             supabase.from('WeeklyFeedbackAssignment').select('*'),
             supabase.from('TutorMeeting').select('id, meeting_date'),
             supabase.from('TutorMeetingAttendance').select('meeting_id, tutor_id, tutor_name, status'),
           ]);


         const myConducted = (schedData || []).filter(
           (r) => !r.is_test_group && r.is_conducted && isSameTutor(r.lesson_teacher, tName)
         );
         const classesConducted = myConducted.length;
         const totalAttendedStudents = myConducted.reduce(
           (s, r) => s + (Number(r.students_attended) || 0),
           0
         );
         const totalEnrolledStudents = myConducted.reduce(
           (s, r) => s + parseEnrolledCount(r),
           0
         );
         const attendancePct =
           classesConducted > 0 && totalEnrolledStudents > 0
             ? Number(((totalAttendedStudents / totalEnrolledStudents) * 100).toFixed(2))
             : null;


         const myAssignments = (fbAssignData || []).filter((a) => {
           if (a.is_sample) return false;
           if (String(a.status || '').toLowerCase() === 'rescheduled') return false;
           const matchUser = (a.tutor_id && a.tutor_id === tId) || isSameTutor(a.tutor_name, tName);
           if (!matchUser || !isLessonFourMultiple(a)) return false;
           if (a.week_start_date) {
             const [ay, am] = a.week_start_date.split('-');
             return Number(ay) === curYear && Number(am) === curMonth;
           }
           return true;
         });
         const fbTarget = myAssignments.length;
         const fbSubmitted = myAssignments.filter(isAssignmentCompleted).length;
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
           const present = myMeetRecs.filter(
             (r) => normalizeAttendanceStatus(r.status) === 'Present'
           ).length;
           const excused = myMeetRecs.filter(
             (r) => normalizeAttendanceStatus(r.status) === 'Excused'
           ).length;
           meetPct = ((present * 1 + excused * 0.75) / myMeetRecs.length) * 100;
         }


         let disciplinePct = null;
         if (fbPct !== null && meetPct !== null) {
           disciplinePct = Number((fbPct * FEEDBACK_WEIGHT + meetPct * MEETING_WEIGHT).toFixed(2));
         } else if (fbPct !== null) {
           disciplinePct = Number(fbPct.toFixed(2));
         } else if (meetPct !== null) {
           disciplinePct = Number(meetPct.toFixed(2));
         }


         const myQcs = (qcData || []).filter((q) => {
           if (q.is_sample || q.evaluation_score === null || q.evaluation_score === undefined) return false;
           const matchUser = (q.tutor_id && q.tutor_id === tId) || isSameTutor(q.tutor_name, tName);
           return matchUser && Number(q.period_month) === prevMonth && Number(q.period_year) === prevYear;
         });
         const qualityScore =
           myQcs.length > 0
             ? Math.round(myQcs.reduce((s, q) => s + Number(q.evaluation_score || 0), 0) / myQcs.length)
             : null;


         const hasAnyMetric =
           attendancePct !== null || disciplinePct !== null || qualityScore !== null;
         const composite = hasAnyMetric
           ? ((attendancePct ?? 0) + (disciplinePct ?? 0) + (qualityScore ?? 0)) / 3
           : null;


         let status = 'No result';
         if (composite !== null) {
           if (composite >= 90) status = 'High Performer';
           else if (composite >= 80) status = 'Stable Performer';
           else if (composite >= 70) status = 'Need Improvement';
           else status = 'Low Performance';
         }


         setMyMetric({
           classesConducted,
           attendancePct,
           totalAttendedStudents,
           totalEnrolledStudents,
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
 }, [currentUser, isAdmin, isTutor]);


 const hasQcPermission = hasPermission('qc_records');
 const hasFeedbackPermission = hasPermission('student_feedback');


 return (
   <div className="space-y-8">
     <div>
       <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
       <p className="text-muted-foreground mt-1">Welcome back, {currentUser?.full_name || 'User'}</p>
     </div>


     {/* ==================== VIEW 1: ADMIN / TEAM LEADER ==================== */}
     {isAdmin && (
       <>
         <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
           <StatCard
             label="Total Tutors"
             value={loading ? '...' : stats.tutors || 0}
             subtext={`${stats.totalUsers || 0} total users`}
             icon={Users}
             color="bg-primary"
             glow="glow-purple"
           />
           <StatCard
             label="Discipline (75/25)"
             value={
               loading
                 ? '...'
                 : adminKpi.disciplineAvg !== null
                 ? `${adminKpi.disciplineAvg}%`
                 : '-'
             }
             subtext={`FB: ${adminKpi.fbAvg ?? '-'}% · Meet: ${adminKpi.meetAvg ?? '-'}%`}
             icon={ShieldCheck}
             color="bg-violet-600"
           />
           <StatCard
             label="QC Result Avg"
             value={loading ? '...' : adminKpi.qcMonthAvg ?? '-'}
             subtext={`P1: ${adminKpi.qcP1Avg ?? '-'} · P2: ${adminKpi.qcP2Avg ?? '-'}`}
             icon={Star}
             color="bg-amber-500"
           />
           {hasFeedbackPermission ? (
             <StatCard
               label="Feedback Records"
               value={loading ? '...' : stats.feedbackRecords || 0}
               subtext={`Avg Point: ${stats.avgFeedbackPoint || 0} / 5`}
               icon={MessageSquare}
               color="bg-chart-4"
             />
           ) : (
             <StatCard
               label="QC Records"
               value={loading ? '...' : stats.qcRecords || 0}
               subtext={`${stats.qcThisMonth || 0} this month`}
               icon={CheckSquare}
               color="bg-chart-3"
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
                   <span className="text-sm text-muted-foreground">Period 1 / Period 2 Avg</span>
                   <span className="text-sm font-bold text-chart-3">
                     {loading ? '...' : `${adminKpi.qcP1Avg ?? '-'} / ${adminKpi.qcP2Avg ?? '-'}`}
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


     {/* ==================== VIEW 2: TUTOR (TIDAK ADA PERUBAHAN) ==================== */}
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
                 {!loading && myMetric.attendancePct !== null && (
                   <div className="text-[11px] text-muted-foreground">
                     {myMetric.totalAttendedStudents}/{myMetric.totalEnrolledStudents} kids
                   </div>
                 )}
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
                     : myMetric.status === 'Low Performance'
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


     {['Tutor', 'Team Leader'].includes(currentUser?.role) && (
       <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
         <TutorTasksPanel />
         <MyWeeklyFeedbackPanel />
       </div>
     )}


     {['Tutor', 'Team Leader'].includes(currentUser?.role) && <QCSubmissionPanel />}


     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
       {isAdmin && (
         <div className="bg-card border border-border rounded-2xl p-6">
           <div className="flex items-center gap-2 mb-4">
             <TrendingUp className="w-5 h-5 text-primary" />
             <h2 className="font-semibold text-foreground">Team Overview</h2>
           </div>
           <div className="space-y-3">
             <div className="flex justify-between items-center">
               <span className="text-sm text-muted-foreground">Head of Tutor</span>
               <span className="text-sm font-medium text-foreground px-2 py-0.5 bg-secondary rounded-lg">
                 {loading ? '...' : stats.roleCounts?.headOfTutor || 0}
               </span>
             </div>
             <div className="flex justify-between items-center">
               <span className="text-sm text-muted-foreground">Team Leader</span>
               <span className="text-sm font-medium text-foreground px-2 py-0.5 bg-secondary rounded-lg">
                 {loading ? '...' : stats.roleCounts?.teamLeader || 0}
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
               {new Date().toLocaleString('en-US', { month: 'long' })}
             </span>
           </div>
           <div className="flex justify-between items-center">
             <span className="text-sm text-muted-foreground">Year</span>
             <span className="text-sm font-medium text-foreground">{new Date().getFullYear()}</span>
           </div>
           <div className="flex justify-between items-center">
             <span className="text-sm text-muted-foreground">Period</span>
             <span className="text-sm font-medium text-foreground">
               {new Date().getDate() <= 15 ? 'Period 1 (1–15)' : 'Period 2 (16–31)'}
             </span>
           </div>
         </div>
       </div>
     </div>
   </div>
 );
}