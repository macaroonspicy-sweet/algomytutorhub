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
  Award,
  Search,
  FileSpreadsheet,
  Loader2,
  Info,
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

export default function TutorMetric() {
  const [loading, setLoading] = useState(true);
  const [tutors, setTutors] = useState([]);
  const [scheduleRecords, setScheduleRecords] = useState([]);
  const [qcRecords, setQcRecords] = useState([]);
  const [feedbackAssignments, setFeedbackAssignments] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [meetingAttendances, setMeetingAttendances] = useState([]);

  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState('2026');
  const [qcSourceMode, setQcSourceMode] = useState('last_month'); // 'last_month' | 'same_month'
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadAllData = async () => {
    setLoading(true);
    try {
      const { data: userData, error: userErr } = await supabase
        .from('CustomUser')
        .select('id, full_name, username, role, is_active')
        .in('role', ['Tutor', 'Team Leader'])
        .order('full_name', { ascending: true });
      if (userErr) throw userErr;
      setTutors((userData || []).filter((u) => u.is_active !== false));

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
        .select('id, meeting_date');
      if (meetErr) throw meetErr;
      setMeetings(meetData || []);

      const { data: attData, error: attErr } = await supabase
        .from('TutorMeetingAttendance')
        .select('meeting_id, tutor_id, tutor_name, status');
      if (attErr) throw attErr;
      setMeetingAttendances(attData || []);
    } catch (err) {
      toast.error('Failed to load Tutor Metric data', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const targetQcPeriod = useMemo(() => {
    if (selectedMonth === 'all' || selectedYear === 'all') return null;
    let m = Number(selectedMonth);
    let y = Number(selectedYear);
    if (qcSourceMode === 'last_month') {
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    return { month: m, year: y };
  }, [selectedMonth, selectedYear, qcSourceMode]);

  const metricRows = useMemo(() => {
    const validMeetingIds = new Set(
      meetings
        .filter((m) => {
          if (!m.meeting_date) return false;
          const [y, mStr] = m.meeting_date.split('-');
          if (selectedYear !== 'all' && y !== selectedYear) return false;
          if (selectedMonth !== 'all' && String(Number(mStr)) !== selectedMonth) return false;
          return true;
        })
        .map((m) => m.id)
    );

    const computed = tutors.map((tutor) => {
      const tName = tutor.full_name || tutor.username || 'Unknown';

      // A. Attendance %
      const tutorConducted = scheduleRecords.filter((r) => {
        if (r.is_test_group || !r.is_conducted) return false;
        if (selectedYear !== 'all' && String(r.lesson_year) !== selectedYear) return false;
        if (selectedMonth !== 'all' && String(r.lesson_month) !== selectedMonth) return false;
        return isSameTutor(r.lesson_teacher, tName);
      });

      const attendancePct =
        tutorConducted.length > 0
          ? Number(
              (
                tutorConducted.reduce((sum, r) => sum + (Number(r.attendance_pct) || 0), 0) /
                tutorConducted.length
              ).toFixed(2)
            )
          : null;

      // B. Discipline % (Lesson 4 multiples feedback compliance + Meeting presence with Excused = 0.75)
      const tutorAssignments = feedbackAssignments.filter((a) => {
        if (a.is_sample) return false;
        if (String(a.status || '').toLowerCase() === 'rescheduled') return false;
        const matchUser =
          (a.tutor_id && a.tutor_id === tutor.id) || isSameTutor(a.tutor_name, tName);
        if (!matchUser || !isLessonFourMultiple(a)) return false;

        if (a.week_start_date) {
          const [ay, am] = a.week_start_date.split('-');
          if (selectedYear !== 'all' && ay !== selectedYear) return false;
          if (selectedMonth !== 'all' && String(Number(am)) !== selectedMonth) return false;
        }
        return true;
      });

      const fbTarget = tutorAssignments.length;
      const fbSubmitted = tutorAssignments.filter(isAssignmentCompleted).length;
      const fbPct = fbTarget > 0 ? Math.min(100, (fbSubmitted / fbTarget) * 100) : null;

      const tutorMeetRecs = meetingAttendances.filter(
        (att) =>
          validMeetingIds.has(att.meeting_id) &&
          (att.tutor_id === tutor.id || isSameTutor(att.tutor_name, tName))
      );
      let meetPct = null;
      if (tutorMeetRecs.length > 0) {
        const present = tutorMeetRecs.filter(
          (r) => normalizeAttendanceStatus(r.status) === 'Present'
        ).length;
        const excused = tutorMeetRecs.filter(
          (r) => normalizeAttendanceStatus(r.status) === 'Excused'
        ).length;
        meetPct = ((present * 1 + excused * 0.75) / tutorMeetRecs.length) * 100;
      }

      const discParts = [fbPct, meetPct].filter((v) => v !== null);
      const disciplinePct =
        discParts.length > 0
          ? Number((discParts.reduce((a, b) => a + b, 0) / discParts.length).toFixed(2))
          : null;

      // C. Quality (QC) Score
      const tutorQcs = qcRecords.filter((q) => {
        const matchUser = (q.tutor_id && q.tutor_id === tutor.id) || isSameTutor(q.tutor_name, tName);
        if (!matchUser || q.evaluation_score === null || q.evaluation_score === undefined) return false;
        if (targetQcPeriod) {
          return (
            Number(q.period_month) === targetQcPeriod.month &&
            Number(q.period_year) === targetQcPeriod.year
          );
        }
        return true;
      });

      const qualityScore =
        tutorQcs.length > 0
          ? Math.round(
              tutorQcs.reduce((s, q) => s + Number(q.evaluation_score || 0), 0) / tutorQcs.length
            )
          : null;

      // D. Complaint
      const complaint = '-';

      // E. Overall Composite Score = (Attendance + Discipline + Quality) / 3
      const hasAnyMetric =
        attendancePct !== null || disciplinePct !== null || qualityScore !== null;
      const compositeScore = hasAnyMetric
        ? ((attendancePct ?? 0) + (disciplinePct ?? 0) + (qualityScore ?? 0)) / 3
        : -1;

      let status = 'No result';
      if (hasAnyMetric) {
        if (compositeScore >= 90) status = 'High Performer';
        else if (compositeScore >= 80) status = 'Stable Performer';
        else if (compositeScore >= 70) status = 'Need Improvement';
        else status = 'Probation Candidate';
      }

      return {
        id: tutor.id,
        teacherName: tName,
        teamLeader: 'Putri Nadia Ayu R',
        attendancePct,
        disciplinePct,
        qualityScore,
        complaint,
        status,
        compositeScore,
      };
    });

    return computed.sort((a, b) => {
      if (a.compositeScore === -1 && b.compositeScore === -1) {
        return a.teacherName.localeCompare(b.teacherName);
      }
      if (a.compositeScore === -1) return 1;
      if (b.compositeScore === -1) return -1;
      if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
      return a.teacherName.localeCompare(b.teacherName);
    });
  }, [
    tutors,
    scheduleRecords,
    qcRecords,
    feedbackAssignments,
    meetings,
    meetingAttendances,
    selectedMonth,
    selectedYear,
    targetQcPeriod,
  ]);

  const filteredRows = useMemo(() => {
    return metricRows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search.trim() && !r.teacherName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [metricRows, statusFilter, search]);

  const statusCounts = useMemo(() => {
    return {
      high: metricRows.filter((r) => r.status === 'High Performer').length,
      stable: metricRows.filter((r) => r.status === 'Stable Performer').length,
      needImp: metricRows.filter((r) => r.status === 'Need Improvement').length,
      probation: metricRows.filter((r) => r.status === 'Probation Candidate').length,
      noResult: metricRows.filter((r) => r.status === 'No result').length,
    };
  }, [metricRows]);

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const rows = filteredRows.map((r, idx) => ({
        Rating: idx + 1,
        'Teacher Name': r.teacherName,
        'Team Leader': r.teamLeader,
        Attendance: r.attendancePct !== null ? `${r.attendancePct.toFixed(2)}%` : 'No attendance',
        Discipline: r.disciplinePct !== null ? `${r.disciplinePct.toFixed(2)}%` : 'No discipline',
        'Quality (QC)': r.qualityScore !== null ? r.qualityScore : 'No Quality',
        'Final Score': r.compositeScore >= 0 ? r.compositeScore.toFixed(2) : '-',
        Complaint: r.complaint,
        Status: r.status,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Tutor Metric');
      const mLabel =
        selectedMonth === 'all'
          ? 'AllMonths'
          : MONTHS.find((m) => m.value === selectedMonth)?.label || selectedMonth;
      XLSX.writeFile(wb, `Tutor_Metric_${mLabel}_${selectedYear}.xlsx`);
      toast.success('Tutor Metric report downloaded');
    } catch (err) {
      toast.error('Export failed', { description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2.5">
            <Award className="w-7 h-7 text-primary" />
            Tutor Metric
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quality updated monthly (based on last month&apos;s QC result) • Attendance &amp; Discipline updated weekly.
          </p>
        </div>

        <Button variant="outline" onClick={handleExportExcel} className="border-border gap-2 self-start lg:self-auto">
          <FileSpreadsheet className="w-4 h-4" /> Export Excel
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                <strong className="text-foreground">Formula:</strong> (Attendance + Discipline + Quality) ÷ 3
              </div>
              <div>
                <strong className="text-foreground">Quality (QC):</strong> Updated monthly (based on last month&apos;s QC result)
              </div>
              <div>
                <strong className="text-foreground">Attendance &amp; Discipline:</strong> Updated weekly 
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
              90–100 = High Performer ({statusCounts.high})
            </span>
            <span className="inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold border border-blue-200">
              80–89 = Stable Performer ({statusCounts.stable})
            </span>
            <span className="inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-semibold border border-amber-200">
              70–79 = Need Improvement ({statusCounts.needImp})
            </span>
            <span className="inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-semibold border border-rose-200">
              &lt;70 = Probation Candidate ({statusCounts.probation})
            </span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 grid grid-cols-2 gap-2.5">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger>
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
            <SelectTrigger>
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
            </SelectContent>
          </Select>

          <Select value={qcSourceMode} onValueChange={setQcSourceMode}>
            <SelectTrigger className="col-span-2">
              <SelectValue placeholder="QC Period Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_month">QC Source: Last Month&apos;s Result (Default SOP)</SelectItem>
              <SelectItem value="same_month">QC Source: Current Selected Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teacher name..."
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Filter Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status ({metricRows.length})</SelectItem>
            <SelectItem value="High Performer">High Performer ({statusCounts.high})</SelectItem>
            <SelectItem value="Stable Performer">Stable Performer ({statusCounts.stable})</SelectItem>
            <SelectItem value="Need Improvement">Need Improvement ({statusCounts.needImp})</SelectItem>
            <SelectItem value="Probation Candidate">Probation Candidate ({statusCounts.probation})</SelectItem>
            <SelectItem value="No result">No result ({statusCounts.noResult})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary/10 border-b border-border text-xs text-foreground">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold w-16 text-center">Rating</th>
                  <th className="px-4 py-3 font-semibold">Teacher Name</th>
                  <th className="px-4 py-3 font-semibold">Team Leader</th>
                  <th className="px-4 py-3 font-semibold text-center">Attendance</th>
                  <th className="px-4 py-3 font-semibold text-center">Discipline</th>
                  <th className="px-4 py-3 font-semibold text-center">Quality (QC)</th>
                  <th className="px-4 py-3 font-semibold text-center">Complaint</th>
                  <th className="px-4 py-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-muted-foreground text-sm">
                      No tutor metrics found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {row.teacherName}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {row.teamLeader}
                      </td>
                      <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                        {row.attendancePct !== null ? (
                          <span className="font-semibold text-foreground">
                            {row.attendancePct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-600 font-medium">
                            No attendance
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                        {row.disciplinePct !== null ? (
                          <span className="font-semibold text-foreground">
                            {row.disciplinePct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-600 font-medium">
                            No discipline
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                        {row.qualityScore !== null ? (
                          <span
                            className={`inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-md font-bold ${
                              row.qualityScore >= 90
                                ? 'bg-emerald-50 text-emerald-700'
                                : row.qualityScore >= 80
                                ? 'bg-sky-50 text-sky-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {row.qualityScore}
                          </span>
                        ) : (
                          <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-600 font-medium">
                            No Quality
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                        {row.complaint}
                      </td>
                      <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                        {row.status === 'High Performer' ? (
                          <span className="inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                            High Performer
                          </span>
                        ) : row.status === 'Stable Performer' ? (
                          <span className="inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                            Stable Performer
                          </span>
                        ) : row.status === 'Need Improvement' ? (
                          <span className="inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
                            Need Improvement
                          </span>
                        ) : row.status === 'Probation Candidate' ? (
                          <span className="inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full bg-rose-50 text-rose-700 font-semibold border border-rose-200">
                            Probation Candidate
                          </span>
                        ) : (
                          <span className="inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full bg-secondary text-muted-foreground font-medium">
                            No result
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}