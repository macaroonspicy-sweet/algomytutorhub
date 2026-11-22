import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart3,
  Search,
  FileSpreadsheet,
  Loader2,
  Users,
  CalendarCheck,
  Percent,
  ShieldCheck,
  Award,
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
const ON_TIME_POINTS = 100;
const DONE_OVERDUE_POINTS = 75;

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

const getFeedbackItemScore = (assignment) => {
  const status = String(assignment.status || '').trim().toLowerCase();
  if (
    status === 'done_overdue' ||
    (assignment.is_overdue === true && (assignment.is_done === true || status.includes('done')))
  ) {
    return DONE_OVERDUE_POINTS;
  }
  if (
    assignment.is_done === true ||
    ['completed', 'done', 'on_time', 'ontime'].includes(status)
  ) {
    return ON_TIME_POINTS;
  }
  return 0;
};

const parseExpectedStudentsCount = (r) => {
  const rawMatch = String(r.students_raw || '').replace(/\u00a0/g, ' ').trim().match(/^(\d+)/);
  if (rawMatch) {
    const parsed = Number(rawMatch[1]);
    if (parsed > 0) return parsed;
  }
  const direct = Number(r.students_count);
  if (!Number.isNaN(direct) && direct > 0) return direct;
  return 0;
};

const getStatusFromScore = (score) => {
  if (score === null || score === undefined) return 'No result';
  if (score >= 90) return 'High Performer';
  if (score >= 80) return 'Stable Performer';
  if (score >= 70) return 'Need Improvement';
  return 'Low Performance';
};

const getPerformanceBadge = (status) => {
  switch (status) {
    case 'High Performer':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Stable Performer':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Need Improvement':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Low Performance':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-secondary text-muted-foreground border-border';
  }
};

export default function TutorMetric() {
  const [loading, setLoading] = useState(true);
  const [tutors, setTutors] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [feedbackAssignments, setFeedbackAssignments] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [meetingAttendances, setMeetingAttendances] = useState([]);
  const [qcRecords, setQcRecords] = useState([]);

  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState('2026');
  const [qcPeriodMode, setQcPeriodMode] = useState('prev'); // 'prev' (Last month SOP) | 'current'
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        { data: userData, error: userErr },
        { data: fbData, error: fbErr },
        { data: meetData, error: meetErr },
        { data: attData, error: attErr },
        { data: qcData, error: qcErr },
      ] = await Promise.all([
        supabase
          .from('CustomUser')
          .select('id, full_name, username, role, taught_courses')
          .in('role', ['Tutor', 'Team Leader'])
          .order('full_name', { ascending: true }),
        supabase.from('WeeklyFeedbackAssignment').select('*'),
        supabase.from('TutorMeeting').select('id, meeting_date'),
        supabase.from('TutorMeetingAttendance').select('meeting_id, tutor_id, tutor_name, status'),
        supabase.from('QCRecord').select('*'),
      ]);

      if (userErr) throw userErr;
      if (fbErr) throw fbErr;
      if (meetErr) throw meetErr;
      if (attErr) throw attErr;
      if (qcErr) throw qcErr;

      let allSched = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('BoScheduleRecord')
          .select(
            'id, lesson_teacher, lesson_month, lesson_year, attendance_pct, students_count, students_raw, students_attended, is_conducted, is_test_group'
          )
          .range(from, from + step - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allSched = allSched.concat(data);
        if (data.length < step) break;
        from += step;
      }

      setTutors(userData || []);
      setSchedules(allSched);
      setFeedbackAssignments(fbData || []);
      setMeetings(meetData || []);
      setMeetingAttendances(attData || []);
      setQcRecords((qcData || []).filter((q) => !q.is_sample));
    } catch (err) {
      toast.error('Failed to load Tutor Metric data', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const metricRows = useMemo(() => {
    const mNum = Number(selectedMonth);
    const yNum = Number(selectedYear);

    const qcTargetMonth =
      qcPeriodMode === 'prev' ? (mNum === 1 ? 12 : mNum - 1) : mNum;
    const qcTargetYear =
      qcPeriodMode === 'prev' ? (mNum === 1 ? yNum - 1 : yNum) : yNum;

    const validMeetingIds = new Set(
      meetings
        .filter((m) => {
          if (!m.meeting_date) return false;
          const [y, mStr] = m.meeting_date.split('-');
          return Number(y) === yNum && Number(mStr) === mNum;
        })
        .map((m) => m.id)
    );

    const monthSchedules = schedules.filter(
      (r) =>
        !r.is_test_group &&
        r.is_conducted &&
        (Number(r.students_attended) || 0) >= 1 &&
        Number(r.lesson_month) === mNum &&
        Number(r.lesson_year) === yNum
    );

    const monthAssignments = feedbackAssignments.filter((a) => {
      if (a.is_sample) return false;
      if (String(a.status || '').toLowerCase() === 'rescheduled') return false;
      if (!isLessonFourMultiple(a)) return false;
      if (a.week_start_date) {
        const [ay, am] = a.week_start_date.split('-');
        return Number(ay) === yNum && Number(am) === mNum;
      }
      return true;
    });

    const targetQcs = qcRecords.filter(
      (q) =>
        q.evaluation_score !== null &&
        q.evaluation_score !== undefined &&
        Number(q.period_month) === qcTargetMonth &&
        Number(q.period_year) === qcTargetYear
    );

    const rows = tutors.map((tutor) => {
      const tName = tutor.full_name || tutor.username || '';
      const tId = tutor.id;

      // 1. Attendance Ratio = (totalAttended / totalExpected) * 100%
      const myScheds = monthSchedules.filter((r) => isSameTutor(r.lesson_teacher, tName));
      const classesConducted = myScheds.length;
      const totalAttended = myScheds.reduce((s, r) => s + (Number(r.students_attended) || 0), 0);
      const totalExpected = myScheds.reduce((s, r) => s + parseExpectedStudentsCount(r), 0);
      const attendancePct =
        classesConducted > 0 && totalExpected > 0
          ? Number(((totalAttended / totalExpected) * 100).toFixed(2))
          : null;

      // 2. Discipline (75% Monthly Feedback dengan penalti done_overdue + 25% Meeting Presence)
      const myFb = monthAssignments.filter(
        (a) => (a.tutor_id && a.tutor_id === tId) || isSameTutor(a.tutor_name, tName)
      );
      let fbPct = null;
      let doneOverdueCount = 0;
      let missedOrOverdueFeedback = 0;
      if (myFb.length > 0) {
        let totalFbScore = 0;
        myFb.forEach((item) => {
          const itemScore = getFeedbackItemScore(item);
          if (itemScore === DONE_OVERDUE_POINTS) doneOverdueCount += 1;
          if (itemScore < ON_TIME_POINTS) missedOrOverdueFeedback += 1;
          totalFbScore += itemScore;
        });
        fbPct = Number((totalFbScore / myFb.length).toFixed(1));
      }

      const myMeetAtt = meetingAttendances.filter(
        (att) =>
          validMeetingIds.has(att.meeting_id) &&
          (att.tutor_id === tId || isSameTutor(att.tutor_name, tName))
      );
      let meetPct = null;
      let absentMeetingCount = 0;
      if (myMeetAtt.length > 0) {
        const present = myMeetAtt.filter(
          (r) => normalizeAttendanceStatus(r.status) === 'Present'
        ).length;
        const excused = myMeetAtt.filter(
          (r) => normalizeAttendanceStatus(r.status) === 'Excused'
        ).length;
        absentMeetingCount = myMeetAtt.filter(
          (r) => normalizeAttendanceStatus(r.status) === 'Absent'
        ).length;
        meetPct = Number((((present * 1 + excused * 0.75) / myMeetAtt.length) * 100).toFixed(1));
      }

      let disciplinePct = null;
      if (fbPct !== null && meetPct !== null) {
        disciplinePct = Number((fbPct * FEEDBACK_WEIGHT + meetPct * MEETING_WEIGHT).toFixed(2));
      } else if (fbPct !== null) {
        disciplinePct = Number(fbPct.toFixed(2));
      } else if (meetPct !== null) {
        disciplinePct = Number(meetPct.toFixed(2));
      }

      const hasDisciplineIssue =
        (fbPct !== null && fbPct < 100) ||
        (meetPct !== null && meetPct < 100) ||
        missedOrOverdueFeedback > 0 ||
        absentMeetingCount > 0;
      const disciplineLabel = !hasDisciplineIssue
        ? 'No discipline'
        : `${disciplinePct !== null ? `${disciplinePct}%` : 'Issue'}${
            doneOverdueCount > 0 ? ` (${doneOverdueCount} overdue)` : ''
          }`;

      // 3. Quality (QC)
      const myQcs = targetQcs.filter(
        (q) => (q.tutor_id && q.tutor_id === tId) || isSameTutor(q.tutor_name, tName)
      );
      const qualityScore =
        myQcs.length > 0
          ? Number(
              (
                myQcs.reduce((s, q) => s + Number(q.evaluation_score || 0), 0) / myQcs.length
              ).toFixed(1)
            )
          : null;

      // 4. Composite Score & Status
      const activeScores = [attendancePct, qualityScore].filter((v) => v !== null);
      const compositeScore =
        activeScores.length > 0
          ? Number((activeScores.reduce((a, b) => a + b, 0) / activeScores.length).toFixed(2))
          : null;

      const status = getStatusFromScore(compositeScore);

      return {
        id: tId,
        teacherName: tName,
        teamLeader: 'Putri Nadia Ayu R',
        role: tutor.role,
        classesConducted,
        totalAttended,
        totalExpected,
        attendancePct,
        disciplineLabel,
        hasDisciplineIssue,
        fbPct,
        doneOverdueCount,
        meetPct,
        disciplinePct,
        qualityScore,
        qcCount: myQcs.length,
        complaint: '-',
        compositeScore,
        status,
      };
    });

    return rows.sort((a, b) => {
      const scoreA = a.compositeScore ?? -1;
      const scoreB = b.compositeScore ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      const attA = a.attendancePct ?? -1;
      const attB = b.attendancePct ?? -1;
      return attB - attA;
    });
  }, [
    tutors,
    schedules,
    feedbackAssignments,
    meetings,
    meetingAttendances,
    qcRecords,
    selectedMonth,
    selectedYear,
    qcPeriodMode,
  ]);

  const filteredRows = useMemo(() => {
    return metricRows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!row.teacherName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [metricRows, statusFilter, search]);

  const summary = useMemo(() => {
    const validDisc = filteredRows.filter((r) => r.disciplinePct !== null);
    const validQc = filteredRows.filter((r) => r.qualityScore !== null);

    const sumAttended = filteredRows.reduce((s, r) => s + (r.totalAttended || 0), 0);
    const sumExpected = filteredRows.reduce((s, r) => s + (r.totalExpected || 0), 0);
    const avgAttendance =
      sumExpected > 0 ? Number(((sumAttended / sumExpected) * 100).toFixed(1)) : null;

    const avg = (arr, key) =>
      arr.length > 0
        ? Number((arr.reduce((s, r) => s + Number(r[key] || 0), 0) / arr.length).toFixed(1))
        : null;

    return {
      totalTutors: filteredRows.length,
      totalClasses: filteredRows.reduce((s, r) => s + r.classesConducted, 0),
      avgAttendance,
      avgDiscipline: avg(validDisc, 'disciplinePct'),
      avgQuality: avg(validQc, 'qualityScore'),
    };
  }, [filteredRows]);

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const exportData = filteredRows.map((r, idx) => ({
        Rating: idx + 1,
        'Teacher Name': r.teacherName,
        'Team Leader': r.teamLeader,
        'Attendance (%)': r.attendancePct !== null ? `${r.attendancePct.toFixed(2)}%` : '-',
        'Student Ratio': `${r.totalAttended}/${r.totalExpected}`,
        Discipline: r.disciplineLabel,
        'Quality (QC)': r.qualityScore !== null ? r.qualityScore : '-',
        Complaint: r.complaint,
        Status: r.status,
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportData), 'Tutor Central');
      XLSX.writeFile(wb, `Tutor_Central_${selectedMonth}_${selectedYear}.xlsx`);
      toast.success('Tutor Metric report exported');
    } catch (err) {
      toast.error('Export failed', { description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2.5">
            <BarChart3 className="w-7 h-7 text-primary" />
            Tutor Metric
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monthly tutor performance evaluation: Attendance Ratio, Discipline (75% Feedback + 25% Meeting), &amp; Last Month QC Quality.
          </p>
        </div>

        <Button variant="outline" onClick={handleExportExcel} className="gap-2 self-start lg:self-auto">
          <FileSpreadsheet className="w-4 h-4" /> Export Excel
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger>
            <SelectValue placeholder="Month" />
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
          <SelectTrigger>
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2026">2026</SelectItem>
            <SelectItem value="2025">2025</SelectItem>
          </SelectContent>
        </Select>

        <Select value={qcPeriodMode} onValueChange={setQcPeriodMode}>
          <SelectTrigger>
            <SelectValue placeholder="QC Reference" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="prev">QC: Last Month (Default SOP)</SelectItem>
            <SelectItem value="current">QC: Current Selected Month</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Performance Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="High Performer">High Performer (90–100)</SelectItem>
            <SelectItem value="Stable Performer">Stable Performer (80–89.99)</SelectItem>
            <SelectItem value="Need Improvement">Need Improvement (70–79.99)</SelectItem>
            <SelectItem value="Low Performance">Low Performance (&lt;70)</SelectItem>
            <SelectItem value="No result">No result</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teacher name..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{summary.totalTutors}</div>
            <div className="text-xs text-muted-foreground">Active Tutors</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{summary.totalClasses}</div>
            <div className="text-xs text-muted-foreground">Total Conducted</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Percent className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">
              {summary.avgAttendance !== null ? `${summary.avgAttendance}%` : '-'}
            </div>
            <div className="text-xs text-muted-foreground">Avg Attendance</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">
              {summary.avgDiscipline !== null ? `${summary.avgDiscipline}%` : '-'}
            </div>
            <div className="text-xs text-muted-foreground">Avg Discipline</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">
              {summary.avgQuality !== null ? summary.avgQuality : '-'}
            </div>
            <div className="text-xs text-muted-foreground">Avg QC Quality</div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 border-b border-border text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3.5 text-left font-semibold">Rating</th>
                  <th className="px-4 py-3.5 text-left font-semibold">Teacher Name</th>
                  <th className="px-4 py-3.5 text-left font-semibold">Team Leader</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Attendance</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Discipline</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Quality (QC)</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Complaint</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground text-sm">
                      No tutor metrics found for the selected period.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3.5 text-xs font-semibold text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-foreground">{row.teacherName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {row.classesConducted} conducted classes
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground text-xs">
                        {row.teamLeader}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="font-semibold text-teal-600">
                          {row.attendancePct !== null ? `${row.attendancePct.toFixed(2)}%` : '-'}
                        </div>
                        {row.attendancePct !== null && (
                          <div className="text-[11px] text-muted-foreground">
                            ({row.totalAttended}/{row.totalExpected})
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`text-xs font-medium ${
                            row.hasDisciplineIssue ? 'text-violet-600' : 'text-muted-foreground'
                          }`}
                        >
                          {row.disciplineLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold text-amber-600">
                        {row.qualityScore !== null ? row.qualityScore : '-'}
                      </td>
                      <td className="px-4 py-3.5 text-center text-muted-foreground">
                        {row.complaint}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span
                          className={`inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold border ${getPerformanceBadge(
                            row.status
                          )}`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}