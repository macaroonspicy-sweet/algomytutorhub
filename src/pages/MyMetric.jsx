import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAppAuth } from '@/lib/AppAuthContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Award,
  BookOpen,
  CalendarCheck,
  ShieldCheck,
  Star,
  AlertCircle,
  Loader2,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = [
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

export default function MyMetric() {
  const { currentUser } = useAppAuth();
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState('2026');

  const [schedules, setSchedules] = useState([]);
  const [feedbackAssignments, setFeedbackAssignments] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [meetingAttendances, setMeetingAttendances] = useState([]);
  const [qcRecords, setQcRecords] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [schedRes, fbRes, meetRes, attRes, qcRes] = await Promise.all([
          supabase
            .from('BoScheduleRecord')
            .select(
              'id, lesson_teacher, lesson_month, lesson_year, attendance_pct, students_count, students_raw, students_attended, is_conducted, is_test_group'
            ),
          supabase.from('WeeklyFeedbackAssignment').select('*'),
          supabase.from('TutorMeeting').select('*'),
          supabase.from('TutorMeetingAttendance').select('*'),
          supabase.from('QCRecord').select('*'),
        ]);

        if (schedRes.error) throw schedRes.error;
        if (fbRes.error) throw fbRes.error;
        if (meetRes.error) throw meetRes.error;
        if (attRes.error) throw attRes.error;
        if (qcRes.error) throw qcRes.error;

        setSchedules(schedRes.data || []);
        setFeedbackAssignments(fbRes.data || []);
        setMeetings(meetRes.data || []);
        setMeetingAttendances(attRes.data || []);
        setQcRecords((qcRes.data || []).filter((q) => !q.is_sample));
      } catch (err) {
        toast.error('Failed to load My Metric', { description: err.message });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const metric = useMemo(() => {
    const mNum = Number(selectedMonth);
    const yNum = Number(selectedYear);
    const prevMonth = mNum === 1 ? 12 : mNum - 1;
    const prevYear = mNum === 1 ? yNum - 1 : yNum;

    const tName = currentUser?.full_name || currentUser?.username || '';
    const tId = currentUser?.id;

    // 1. Classes Conducted & Student Attendance Ratio
    const myConducted = schedules.filter(
      (r) =>
        !r.is_test_group &&
        r.is_conducted &&
        Number(r.lesson_month) === mNum &&
        Number(r.lesson_year) === yNum &&
        isSameTutor(r.lesson_teacher, tName)
    );
    const classesConducted = myConducted.length;
    const totalAttended = myConducted.reduce((s, r) => s + (Number(r.students_attended) || 0), 0);
    const totalEnrolled = myConducted.reduce((s, r) => s + parseEnrolledCount(r), 0);
    const attendancePct =
      classesConducted > 0 && totalEnrolled > 0
        ? Number(((totalAttended / totalEnrolled) * 100).toFixed(2))
        : null;

    // 2. Discipline (75% Monthly Feedback + 25% Meeting Presence)
    const myAssignments = feedbackAssignments.filter((a) => {
      if (a.is_sample) return false;
      if (String(a.status || '').toLowerCase() === 'rescheduled') return false;
      const matchUser = (a.tutor_id && a.tutor_id === tId) || isSameTutor(a.tutor_name, tName);
      if (!matchUser || !isLessonFourMultiple(a)) return false;
      if (a.week_start_date) {
        const [ay, am] = a.week_start_date.split('-');
        return Number(ay) === yNum && Number(am) === mNum;
      }
      return true;
    });
    const fbTarget = myAssignments.length;
    const fbCompleted = myAssignments.filter(isAssignmentCompleted).length;
    const fbPct = fbTarget > 0 ? Math.min(100, (fbCompleted / fbTarget) * 100) : null;

    const meetingMap = new Map();
    meetings.forEach((m) => {
      if (!m.meeting_date) return;
      const [y, mStr] = m.meeting_date.split('-');
      if (Number(y) === yNum && Number(mStr) === mNum) {
        meetingMap.set(m.id, m);
      }
    });

    const myMeetingLogs = meetingAttendances
      .filter(
        (att) =>
          meetingMap.has(att.meeting_id) &&
          ((att.tutor_id && att.tutor_id === tId) || isSameTutor(att.tutor_name, tName))
      )
      .map((att) => {
        const mObj = meetingMap.get(att.meeting_id);
        return {
          id: `${att.meeting_id}-${att.tutor_id || att.tutor_name}`,
          date: mObj?.meeting_date || '-',
          topic: mObj?.title || mObj?.topic || mObj?.agenda || 'QC & Tutor Department Meeting',
          status: normalizeAttendanceStatus(att.status),
          notes: att.notes || '-',
        };
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    let meetPct = null;
    const presentCount = myMeetingLogs.filter((l) => l.status === 'Present').length;
    const excusedCount = myMeetingLogs.filter((l) => l.status === 'Excused').length;
    if (myMeetingLogs.length > 0) {
      meetPct = ((presentCount * 1 + excusedCount * 0.75) / myMeetingLogs.length) * 100;
    }

    let disciplinePct = null;
    if (fbPct !== null && meetPct !== null) {
      disciplinePct = Number((fbPct * FEEDBACK_WEIGHT + meetPct * MEETING_WEIGHT).toFixed(2));
    } else if (fbPct !== null) {
      disciplinePct = Number(fbPct.toFixed(2));
    } else if (meetPct !== null) {
      disciplinePct = Number(meetPct.toFixed(2));
    }

    // 3. Quality (QC from previous month SOP)
    const myQcs = qcRecords.filter((q) => {
      if (q.evaluation_score === null || q.evaluation_score === undefined) return false;
      const matchUser = (q.tutor_id && q.tutor_id === tId) || isSameTutor(q.tutor_name, tName);
      return matchUser && Number(q.period_month) === prevMonth && Number(q.period_year) === prevYear;
    });
    const qualityScore =
      myQcs.length > 0
        ? Math.round(myQcs.reduce((s, q) => s + Number(q.evaluation_score || 0), 0) / myQcs.length)
        : null;

    // 4. Composite & Tier
    const hasAny = attendancePct !== null || disciplinePct !== null || qualityScore !== null;
    const composite = hasAny
      ? ((attendancePct ?? 0) + (disciplinePct ?? 0) + (qualityScore ?? 0)) / 3
      : null;

    let status = 'No result';
    if (composite !== null) {
      if (composite >= 90) status = 'High Performer';
      else if (composite >= 80) status = 'Stable Performer';
      else if (composite >= 70) status = 'Need Improvement';
      else status = 'Low Performance';
    }

    return {
      classesConducted,
      totalAttended,
      totalEnrolled,
      attendancePct,
      fbTarget,
      fbCompleted,
      fbPct: fbPct !== null ? Math.round(fbPct) : null,
      meetTotal: myMeetingLogs.length,
      presentCount,
      excusedCount,
      meetPct: meetPct !== null ? Math.round(meetPct) : null,
      disciplinePct,
      qualityScore,
      complaint: '-',
      status,
      myMeetingLogs,
    };
  }, [
    currentUser,
    schedules,
    feedbackAssignments,
    meetings,
    meetingAttendances,
    qcRecords,
    selectedMonth,
    selectedYear,
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2.5">
              <Award className="w-7 h-7 text-primary" />
              My Metric
            </h1>
            {!loading && (
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                  metric.status === 'High Performer'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : metric.status === 'Stable Performer'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : metric.status === 'Need Improvement'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : metric.status === 'Low Performance'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-secondary text-muted-foreground border-border'
                }`}
              >
                {metric.status}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Personal performance overview for <strong className="text-foreground">{currentUser?.full_name}</strong> (Read-Only)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2026">2026</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* 5 Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Classes Conducted</span>
                <BookOpen className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2">{metric.classesConducted}</div>
              <div className="text-[11px] text-muted-foreground mt-1">Regular lessons taught</div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Attendance</span>
                <CalendarCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2">
                {metric.attendancePct !== null ? `${metric.attendancePct.toFixed(2)}%` : '-'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {metric.attendancePct !== null
                  ? `${metric.totalAttended}/${metric.totalEnrolled} kids attended`
                  : 'Updated every week'}
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Discipline</span>
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2">
                {metric.disciplinePct !== null ? `${metric.disciplinePct.toFixed(2)}%` : '-'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">75% Feedback + 25% Meeting</div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Quality (QC)</span>
                <Star className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2">
                {metric.qualityScore !== null ? metric.qualityScore : '-'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Based on last month&apos;s QC</div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Complaint</span>
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2">{metric.complaint}</div>
              <div className="text-[11px] text-muted-foreground mt-1">Parent / student reports</div>
            </div>
          </div>

          {/* Bottom Split: Discipline Breakdown & Meeting Attendance Log */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="font-semibold text-foreground text-base">Discipline Breakdown</h2>

              <div className="p-4 rounded-xl bg-secondary/50 border border-border flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">Monthly Feedback (75%)</div>
                  <div className="text-xs text-muted-foreground">Lesson 4 multiples completed</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-foreground">
                    {metric.fbCompleted} / {metric.fbTarget}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {metric.fbPct !== null ? `${metric.fbPct}%` : '-'}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-secondary/50 border border-border flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">QC Meeting Presence (25%)</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Present: 100% · Excused: 75% · Absent: 0%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-foreground">
                    {metric.meetPct !== null ? `${metric.meetPct}%` : '-'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    ({metric.presentCount + metric.excusedCount}/{metric.meetTotal})
                  </div>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <div className="text-xs font-semibold text-foreground">Performance Tiers</div>
                <div className="text-[11px] text-muted-foreground">
                  Formula: (Attendance + Discipline + Quality) ÷ 3
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-semibold">
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                    90–100: High Performer
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                    80–89: Stable Performer
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                    70–79: Need Improvement
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                    &lt;70: Low Performance
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 bg-card border border-border rounded-2xl p-6">
              <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                  <h2 className="font-semibold text-foreground text-base">My QC Meeting Attendance Log</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Attendance records logged by the QC &amp; Team Leader team
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="w-3.5 h-3.5" /> Read-only
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-2.5 font-semibold">Date</th>
                      <th className="py-2.5 font-semibold">Meeting Topic</th>
                      <th className="py-2.5 font-semibold text-center">Status</th>
                      <th className="py-2.5 font-semibold text-right">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {metric.myMeetingLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground">
                          No meeting attendance records for this month.
                        </td>
                      </tr>
                    ) : (
                      metric.myMeetingLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-3 font-medium text-foreground whitespace-nowrap">{log.date}</td>
                          <td className="py-3 text-foreground pr-3">{log.topic}</td>
                          <td className="py-3 text-center">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                log.status === 'Present'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : log.status === 'Excused'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="py-3 text-right text-muted-foreground">{log.notes}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}