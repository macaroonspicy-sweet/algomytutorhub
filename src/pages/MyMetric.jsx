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
  Info,
  CheckCircle2,
  Clock,
  XCircle,
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

export default function MyMetric() {
  const { currentUser } = useAppAuth();
  const [loading, setLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

  const [scheduleRecords, setScheduleRecords] = useState([]);
  const [qcRecords, setQcRecords] = useState([]);
  const [feedbackAssignments, setFeedbackAssignments] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [meetingAttendances, setMeetingAttendances] = useState([]);

  useEffect(() => {
    async function loadMyData() {
      if (!currentUser) return;
      setLoading(true);
      try {
        let allSchedules = [];
        let from = 0;
        const step = 1000;
        while (true) {
          const { data, error } = await supabase
            .from('BoScheduleRecord')
            .select('id, lesson_teacher, lesson_month, lesson_year, attendance_pct, is_conducted, is_test_group')
            .range(from, from + step - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allSchedules = allSchedules.concat(data);
          if (data.length < step) break;
          from += step;
        }
        setScheduleRecords(allSchedules);

        const { data: qcData, error: qcErr } = await supabase
          .from('QCRecord')
          .select('id, tutor_id, tutor_name, period_month, period_year, evaluation_score, is_sample');
        if (qcErr) throw qcErr;
        setQcRecords((qcData || []).filter((q) => !q.is_sample));

        const { data: assignData, error: assignErr } = await supabase
          .from('WeeklyFeedbackAssignment')
          .select('*');
        if (assignErr) throw assignErr;
        setFeedbackAssignments(assignData || []);

        const { data: meetData, error: meetErr } = await supabase
          .from('TutorMeeting')
          .select('id, meeting_date, topic')
          .order('meeting_date', { ascending: false });
        if (meetErr) throw meetErr;
        setMeetings(meetData || []);

        const { data: attData, error: attErr } = await supabase
          .from('TutorMeetingAttendance')
          .select('id, meeting_id, tutor_id, tutor_name, status, notes');
        if (attErr) throw attErr;
        setMeetingAttendances(attData || []);
      } catch (err) {
        toast.error('Failed to load your performance metrics', { description: err.message });
      } finally {
        setLoading(false);
      }
    }

    loadMyData();
  }, [currentUser]);

  const personalStats = useMemo(() => {
    const tName = currentUser?.full_name || currentUser?.username || '';
    const tId = currentUser?.id;

    // 1. Classes Conducted & Attendance %
    const conductedLessons = scheduleRecords.filter((r) => {
      if (r.is_test_group || !r.is_conducted) return false;
      if (selectedYear !== 'all' && String(r.lesson_year) !== selectedYear) return false;
      if (selectedMonth !== 'all' && String(r.lesson_month) !== selectedMonth) return false;
      return isSameTutor(r.lesson_teacher, tName);
    });

    const classesConducted = conductedLessons.length;
    const attendancePct =
      classesConducted > 0
        ? Number(
            (
              conductedLessons.reduce((sum, r) => sum + (Number(r.attendance_pct) || 0), 0) /
              classesConducted
            ).toFixed(2)
          )
        : null;

    // 2. Monthly Feedback Progress (Lesson 4 multiples, counted per class assignment)
    const myLesson4Assignments = feedbackAssignments.filter((a) => {
      if (a.is_sample) return false;
      if (String(a.status || '').toLowerCase() === 'rescheduled') return false;
      const matchUser = (a.tutor_id && a.tutor_id === tId) || isSameTutor(a.tutor_name, tName);
      if (!matchUser || !isLessonFourMultiple(a)) return false;

      if (a.week_start_date) {
        const [ay, am] = a.week_start_date.split('-');
        if (selectedYear !== 'all' && ay !== selectedYear) return false;
        if (selectedMonth !== 'all' && String(Number(am)) !== selectedMonth) return false;
      }
      return true;
    });

    const fbTarget = myLesson4Assignments.length;
    const fbSubmitted = myLesson4Assignments.filter(isAssignmentCompleted).length;
    const fbPct = fbTarget > 0 ? Math.min(100, (fbSubmitted / fbTarget) * 100) : null;

    // 3. Meeting Presence (Present = 100%, Excused = 75%, Absent = 0%)
    const filteredPeriodMeetings = meetings.filter((m) => {
      if (!m.meeting_date) return false;
      const [y, mStr] = m.meeting_date.split('-');
      if (selectedYear !== 'all' && y !== selectedYear) return false;
      if (selectedMonth !== 'all' && String(Number(mStr)) !== selectedMonth) return false;
      return true;
    });
    const validMeetingIds = new Set(filteredPeriodMeetings.map((m) => m.id));

    const myMeetingLogs = meetingAttendances
      .filter(
        (att) =>
          validMeetingIds.has(att.meeting_id) &&
          (att.tutor_id === tId || isSameTutor(att.tutor_name, tName))
      )
      .map((att) => {
        const meetObj = filteredPeriodMeetings.find((m) => m.id === att.meeting_id);
        return {
          ...att,
          statusLabel: normalizeAttendanceStatus(att.status),
          meeting_date: meetObj?.meeting_date || '-',
          topic: meetObj?.topic || 'QC / Team Meeting',
        };
      })
      .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));

    let meetPct = null;
    let presentCount = 0;
    if (myMeetingLogs.length > 0) {
      presentCount = myMeetingLogs.filter((r) => r.statusLabel === 'Present').length;
      const excusedCount = myMeetingLogs.filter((r) => r.statusLabel === 'Excused').length;
      meetPct = ((presentCount * 1 + excusedCount * 0.75) / myMeetingLogs.length) * 100;
    }

    // 4. Discipline %
    const discParts = [fbPct, meetPct].filter((v) => v !== null);
    const disciplinePct =
      discParts.length > 0
        ? Number((discParts.reduce((a, b) => a + b, 0) / discParts.length).toFixed(2))
        : null;

    // 5. Quality (QC) Score — Default SOP uses previous month's QC evaluation
    let targetQcMonth = selectedMonth === 'all' ? null : Number(selectedMonth) - 1;
    let targetQcYear = selectedYear === 'all' ? null : Number(selectedYear);
    if (targetQcMonth === 0) {
      targetQcMonth = 12;
      targetQcYear -= 1;
    }

    const myQcs = qcRecords.filter((q) => {
      const matchUser = (q.tutor_id && q.tutor_id === tId) || isSameTutor(q.tutor_name, tName);
      if (!matchUser || q.evaluation_score === null || q.evaluation_score === undefined) return false;
      if (targetQcMonth && targetQcYear) {
        return Number(q.period_month) === targetQcMonth && Number(q.period_year) === targetQcYear;
      }
      return true;
    });

    const qualityScore =
      myQcs.length > 0
        ? Math.round(myQcs.reduce((s, q) => s + Number(q.evaluation_score || 0), 0) / myQcs.length)
        : null;

    // 6. Overall Composite Score = (Attendance + Discipline + Quality) / 3
    const hasAnyMetric =
      attendancePct !== null || disciplinePct !== null || qualityScore !== null;
    const compositeScore = hasAnyMetric
      ? ((attendancePct ?? 0) + (disciplinePct ?? 0) + (qualityScore ?? 0)) / 3
      : null;

    let status = 'No result';
    if (compositeScore !== null) {
      if (compositeScore >= 90) status = 'High Performer';
      else if (compositeScore >= 80) status = 'Stable Performer';
      else if (compositeScore >= 70) status = 'Need Improvement';
      else status = 'Low Performance';
    }

    return {
      classesConducted,
      attendancePct,
      disciplinePct,
      qualityScore,
      complaint: '-',
      status,
      fbSubmitted,
      fbTarget,
      meetPct: meetPct !== null ? Math.round(meetPct) : null,
      presentCount,
      totalMeetings: myMeetingLogs.length,
      myMeetingLogs,
    };
  }, [
    currentUser,
    scheduleRecords,
    qcRecords,
    feedbackAssignments,
    meetings,
    meetingAttendances,
    selectedMonth,
    selectedYear,
  ]);

  const renderStatusBadge = (status) => {
    if (status === 'High Performer') {
      return (
        <span className="inline-flex items-center whitespace-nowrap px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
          High Performer
        </span>
      );
    }
    if (status === 'Stable Performer') {
      return (
        <span className="inline-flex items-center whitespace-nowrap px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
          Stable Performer
        </span>
      );
    }
    if (status === 'Need Improvement') {
      return (
        <span className="inline-flex items-center whitespace-nowrap px-3.5 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200">
          Need Improvement
        </span>
      );
    }
    if (status === 'Low Performance') {
      return (
        <span className="inline-flex items-center whitespace-nowrap px-3.5 py-1.5 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold border border-rose-200">
          Low Performance
        </span>
      );
    }
    return (
      <span className="inline-flex items-center whitespace-nowrap px-3.5 py-1.5 rounded-full bg-secondary text-muted-foreground text-xs font-medium">
        No result
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2.5">
              <Award className="w-7 h-7 text-primary" />
              My Metric
            </h1>
            {!loading && renderStatusBadge(personalStats.status)}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Personal performance overview for <strong className="text-foreground">{currentUser?.full_name}</strong> (Read-Only)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-36 bg-card">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28 bg-card">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Classes Conducted</span>
                <BookOpen className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2">
                {personalStats.classesConducted}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Regular lessons taught</div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Attendance</span>
                <CalendarCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2">
                {personalStats.attendancePct !== null ? `${personalStats.attendancePct.toFixed(2)}%` : '-'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Updated every week</div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Discipline</span>
                <ShieldCheck className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2">
                {personalStats.disciplinePct !== null ? `${personalStats.disciplinePct.toFixed(2)}%` : '-'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Feedback &amp; QC Meetings</div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Quality (QC)</span>
                <Star className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2">
                {personalStats.qualityScore !== null ? personalStats.qualityScore : '-'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Based on last month&apos;s QC</div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Complaint</span>
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2">{personalStats.complaint}</div>
              <div className="text-[11px] text-muted-foreground mt-1">Parent / student reports</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="font-semibold text-foreground text-base">Discipline Breakdown</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/40">
                  <div>
                    <div className="font-medium text-foreground">Monthly Feedback</div>
                    <div className="text-xs text-muted-foreground">Lesson 4 multiples completed</div>
                  </div>
                  <div className="text-right font-bold text-foreground">
                    {personalStats.fbTarget > 0
                      ? `${personalStats.fbSubmitted} / ${personalStats.fbTarget}`
                      : '-'}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/40">
                  <div>
                    <div className="font-medium text-foreground">QC Meeting Presence</div>
                    <div className="text-xs text-muted-foreground">
                      Present: 100% • Excused: 75% • Absent: 0%
                    </div>
                  </div>
                  <div className="text-right font-bold text-foreground">
                    {personalStats.totalMeetings > 0
                      ? `${personalStats.meetPct}% (${personalStats.presentCount}/${personalStats.totalMeetings})`
                      : '-'}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <div className="text-xs font-semibold text-foreground mb-1">Performance Tiers</div>
                <div className="text-[11px] text-muted-foreground mb-2">
                  Formula: (Attendance + Discipline + Quality) ÷ 3
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
                    90–100: High Performer
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-medium border border-blue-200">
                    80–89: Stable Performer
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-medium border border-amber-200">
                    70–79: Need Improvement
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-medium border border-rose-200">
                    &lt;70: Low Performance
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-foreground text-base">My QC Meeting Attendance Log</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Attendance records logged by the QC &amp; Team Leader team
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 text-primary" /> Read-only
                </div>
              </div>

              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs text-muted-foreground border-b border-border">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Meeting Topic</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {personalStats.myMeetingLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-muted-foreground text-xs">
                          No QC meetings recorded for this selected period.
                        </td>
                      </tr>
                    ) : (
                      personalStats.myMeetingLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-secondary/20">
                          <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                            {log.meeting_date}
                          </td>
                          <td className="px-4 py-3 text-foreground">{log.topic}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {log.statusLabel === 'Present' ? (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" /> Present
                              </span>
                            ) : log.statusLabel === 'Excused' ? (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock className="w-3 h-3" /> Excused (75%)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <XCircle className="w-3 h-3" /> Absent
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {log.notes || '-'}
                          </td>
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