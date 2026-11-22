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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Activity,
  Users,
  CalendarCheck,
  Percent,
  ShieldCheck,
  Star,
  Search,
  FileSpreadsheet,
  Loader2,
  ArrowUpDown,
  AlertTriangle,
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

const getSortedTokens = (name) => {
  const cleaned = String(name || '')
    .toLowerCase()
    .replace(/\b(binti|bin|md|mohd|muhammad)\b/g, ' ');
  const tokens = cleaned.match(/[a-z0-9]+/g) || [];
  return tokens.filter((t) => t.length > 1).sort();
};

const isSameTutor = (a, b) => {
  if (!a || !b) return false;
  const cleanA = String(a).toLowerCase().trim();
  const cleanB = String(b).toLowerCase().trim();
  if (cleanA === cleanB) return true;

  const tokA = getSortedTokens(a);
  const tokB = getSortedTokens(b);
  if (tokA.length > 0 && tokB.length > 0 && tokA.join('|') === tokB.join('|')) {
    return true;
  }

  const joinedA = tokA.join('');
  const joinedB = tokB.join('');
  if (joinedA && joinedB && joinedA === joinedB) return true;

  return (
    joinedA.length > 4 &&
    joinedB.length > 4 &&
    (joinedA.includes(joinedB) || joinedB.includes(joinedA))
  );
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

const getFeedbackScore = (assignment) => {
  const st = String(assignment.status || '').trim().toLowerCase();
  if (st === 'done_overdue' || st === 'overdue_done' || st === 'late') return 75;
  if (
    assignment.is_done === true ||
    st === 'completed' ||
    st === 'done' ||
    st === 'submitted'
  ) {
    return 100;
  }
  return 0;
};

const parseLeadingInt = (val) => {
  const cleaned = String(val ?? '').replace(/\u00a0/g, ' ').trim();
  const match = cleaned.match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
};

const parsePercentNumber = (val) => {
  const cleaned = String(val ?? '').replace('%', '').trim();
  const num = Number(cleaned);
  return Number.isNaN(num) ? 0 : num;
};

const parseExpectedStudentsCount = (r) => {
  const rawCount = parseLeadingInt(r.students_raw);
  if (rawCount > 0) return rawCount;

  const direct = Number(r.students_count);
  if (!Number.isNaN(direct) && direct > 0) return direct;

  const attended = Number(r.students_attended) || 0;
  if (attended >= 1) return attended;

  return 0;
};

const isLessonConducted = (r) => {
  const attended = Number(r.students_attended) || 0;
  if (r.is_conducted === true) return attended >= 1;
  if (r.is_conducted === false) return false;
  const pct = parsePercentNumber(r.attendance_pct);
  return pct > 0 && attended >= 1;
};

// Rumus: (Attendance + Discipline + QC) / 3
const calcCompositeDividedByThree = (attendancePct, disciplinePct, qcAvg) => {
  const a = attendancePct !== null && attendancePct !== undefined && !Number.isNaN(attendancePct) ? Number(attendancePct) : 0;
  const d = disciplinePct !== null && disciplinePct !== undefined && !Number.isNaN(disciplinePct) ? Number(disciplinePct) : 0;
  const q = qcAvg !== null && qcAvg !== undefined && !Number.isNaN(qcAvg) ? Number(qcAvg) : 0;
  return Number(((a + d + q) / 3).toFixed(2));
};

const getQcTimestamp = (q) => {
  const raw = q.evaluation_date || q.evaluated_at || q.updated_at || q.created_at || '';
  const ts = Date.parse(String(raw));
  return Number.isNaN(ts) ? 0 : ts;
};

const isQcEvaluated = (q) => {
  const hasScore = q.evaluation_score !== null && q.evaluation_score !== undefined && String(q.evaluation_score).trim() !== '';
  if (!hasScore) return false;
  const st = String(q.status || q.evaluation_status || '').trim().toLowerCase();
  if (st === 'pending' || st === 'draft' || st === 'unassigned') return false;
  return true;
};

const getPerformanceStatus = (score) => {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return {
      label: 'No Data',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }
  if (score >= 90) {
    return {
      label: 'High Performer',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  if (score >= 80) {
    return {
      label: 'Stable Performer',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    };
  }
  if (score >= 70) {
    return {
      label: 'Need Improvement',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  return {
    label: 'Low Performance',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  };
};

export default function TutorMetric() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [feedbackAssignments, setFeedbackAssignments] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [meetingAttendances, setMeetingAttendances] = useState([]);
  const [qcRecords, setQcRecords] = useState([]);
  const [complaints, setComplaints] = useState([]);

  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedStatus, setSelectedStatus] = useState('all');
  // 'prev_month' = QC Last Month sesuai SOP | 'latest_evaluated' = QC terbaru di bulan tsb yang sudah dievaluasi | 'all_evaluated' = rata-rata QC bulan tsb
  const [qcMode, setQcMode] = useState('latest_evaluated');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('composite_desc');

  const [detailModal, setDetailModal] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      let allSched = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('BoScheduleRecord')
          .select('*')
          .range(from, from + step - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allSched = allSched.concat(data);
        if (data.length < step) break;
        from += step;
      }
      setSchedules(allSched);

      const [userRes, fbRes, meetRes, attRes, qcRes] = await Promise.all([
        supabase.from('CustomUser').select('*'),
        supabase.from('WeeklyFeedbackAssignment').select('*'),
        supabase.from('TutorMeeting').select('*'),
        supabase.from('TutorMeetingAttendance').select('*'),
        supabase.from('QCRecord').select('*'),
      ]);

      if (userRes.error) console.error('CustomUser error:', userRes.error);
      if (fbRes.error) console.error('WeeklyFeedbackAssignment error:', fbRes.error);
      if (meetRes.error) console.error('TutorMeeting error:', meetRes.error);
      if (attRes.error) console.error('TutorMeetingAttendance error:', attRes.error);
      if (qcRes.error) console.error('QCRecord error:', qcRes.error);

      setUsers(userRes.data || []);
      setFeedbackAssignments(fbRes.data || []);
      setMeetings(meetRes.data || []);
      setMeetingAttendances(attRes.data || []);
      setQcRecords((qcRes.data || []).filter((q) => !q.is_sample));

      const compRes = await supabase.from('ComplaintReport').select('*');
      if (!compRes.error && Array.isArray(compRes.data)) {
        setComplaints(compRes.data);
      } else {
        setComplaints([]);
      }
    } catch (err) {
      toast.error('Failed to load Tutor Metrics', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const tutorMetricsList = useMemo(() => {
    const tutorGroups = [];

    const findOrCreateTutorGroup = (rawName) => {
      const trimmed = String(rawName || '').trim();
      if (!trimmed) return null;
      const existing = tutorGroups.find((g) => isSameTutor(g.canonicalName, trimmed));
      if (existing) {
        if (!existing.aliases.includes(trimmed)) {
          existing.aliases.push(trimmed);
        }
        return existing;
      }
      const created = {
        canonicalName: trimmed,
        aliases: [trimmed],
      };
      tutorGroups.push(created);
      return created;
    };

    users
      .filter((u) => {
        const role = String(u.role || u.user_role || '').toLowerCase();
        return !role || role.includes('tutor') || role.includes('teacher') || role.includes('lead');
      })
      .forEach((u) => findOrCreateTutorGroup(u.full_name || u.name || u.tutor_name));

    schedules.forEach((s) => {
      if (s.is_test_group) return;
      if (selectedYear !== 'all' && String(s.lesson_year) !== selectedYear) return;
      if (selectedMonth !== 'all' && String(s.lesson_month) !== selectedMonth) return;
      findOrCreateTutorGroup(s.lesson_teacher);
    });

    feedbackAssignments.forEach((a) => {
      if (a.is_sample) return;
      findOrCreateTutorGroup(a.tutor_name);
    });

    qcRecords.forEach((q) => {
      findOrCreateTutorGroup(q.tutor_name);
    });

    complaints.forEach((c) => {
      findOrCreateTutorGroup(c.tutor_name || c.lesson_teacher || c.teacher_name);
    });

    const periodSchedules = schedules.filter((r) => {
      if (r.is_test_group) return false;
      if (selectedYear !== 'all' && String(r.lesson_year) !== selectedYear) return false;
      if (selectedMonth !== 'all' && String(r.lesson_month) !== selectedMonth) return false;
      return true;
    });

    const periodFeedbacks = feedbackAssignments.filter((a) => {
      if (a.is_sample) return false;
      if (String(a.status || '').toLowerCase() === 'rescheduled') return false;
      if (!isLessonFourMultiple(a)) return false;
      if (a.week_start_date) {
        const [ay, am] = a.week_start_date.split('-');
        if (selectedYear !== 'all' && ay !== selectedYear) return false;
        if (selectedMonth !== 'all' && String(Number(am)) !== selectedMonth) return false;
      }
      return true;
    });

    const validMeetingIds = new Set();
    meetings.forEach((m) => {
      if (!m.meeting_date) return;
      const [y, mStr] = m.meeting_date.split('-');
      if (selectedYear !== 'all' && y !== selectedYear) return;
      if (selectedMonth !== 'all' && String(Number(mStr)) !== selectedMonth) return;
      validMeetingIds.add(m.id);
    });
    const periodMeetAtts = meetingAttendances.filter((att) => validMeetingIds.has(att.meeting_id));

    // Filter QC sesuai pilihan qcMode
    let qcTargetMonth = selectedMonth === 'all' ? null : Number(selectedMonth);
    let qcTargetYear = selectedYear === 'all' ? null : Number(selectedYear);

    if (qcMode === 'prev_month' && qcTargetMonth !== null && qcTargetYear !== null) {
      qcTargetMonth -= 1;
      if (qcTargetMonth === 0) {
        qcTargetMonth = 12;
        qcTargetYear -= 1;
      }
    }

    const evaluatedQcs = qcRecords
      .filter((q) => {
        if (!isQcEvaluated(q)) return false;
        if (qcTargetYear !== null && Number(q.period_year) !== qcTargetYear) return false;
        if (qcTargetMonth !== null && Number(q.period_month) !== qcTargetMonth) return false;
        return true;
      })
      .sort((a, b) => getQcTimestamp(b) - getQcTimestamp(a));

    const periodComplaints = complaints.filter((c) => {
      const dateRaw = c.complaint_date || c.created_at || c.date || '';
      if (!dateRaw) return true;
      const iso = String(dateRaw).slice(0, 10);
      const [cy, cm] = iso.split('-');
      if (selectedYear !== 'all' && cy && cy !== selectedYear) return false;
      if (selectedMonth !== 'all' && cm && String(Number(cm)) !== selectedMonth) return false;
      return true;
    });

    return tutorGroups.map((group) => {
      const tutorName = group.canonicalName;

      const tSchedules = periodSchedules.filter((r) => isSameTutor(r.lesson_teacher, tutorName));
      const tConductedList = tSchedules.filter(isLessonConducted);
      const conductedCount = tConductedList.length;

      const totalAttended = tConductedList.reduce(
        (sum, r) => sum + (Number(r.students_attended) || 0),
        0
      );
      const totalExpected = tConductedList.reduce(
        (sum, r) => sum + parseExpectedStudentsCount(r),
        0
      );
      const attendancePct =
        conductedCount > 0 && totalExpected > 0
          ? Number(((totalAttended / totalExpected) * 100).toFixed(1))
          : null;

      const tFb = periodFeedbacks.filter((a) => isSameTutor(a.tutor_name, tutorName));
      const fbDoneCount = tFb.filter((a) => getFeedbackScore(a) > 0).length;
      const fbPct =
        tFb.length > 0
          ? Number((tFb.reduce((s, a) => s + getFeedbackScore(a), 0) / tFb.length).toFixed(1))
          : null;

      const tMeet = periodMeetAtts.filter((att) => isSameTutor(att.tutor_name, tutorName));
      const presentCount = tMeet.filter(
        (r) => normalizeAttendanceStatus(r.status) === 'Present'
      ).length;
      const excusedCount = tMeet.filter(
        (r) => normalizeAttendanceStatus(r.status) === 'Excused'
      ).length;
      const absentCount = Math.max(0, tMeet.length - presentCount - excusedCount);

      let meetPct = null;
      if (tMeet.length > 0) {
        meetPct = Number(
          (((presentCount * 1 + excusedCount * 0.75) / tMeet.length) * 100).toFixed(1)
        );
      }

      let disciplinePct = null;
      if (fbPct !== null && meetPct !== null) {
        disciplinePct = Number((fbPct * FEEDBACK_WEIGHT + meetPct * MEETING_WEIGHT).toFixed(1));
      } else if (fbPct !== null) {
        disciplinePct = fbPct;
      } else if (meetPct !== null) {
        disciplinePct = meetPct;
      }

      // QC: jika latest_evaluated, ambil evaluasi terbaru yang sudah dievaluasi; selain itu rata-rata evaluasi
      const tQcAll = evaluatedQcs.filter((q) => isSameTutor(q.tutor_name, tutorName));
      const tQcSelected =
        qcMode === 'latest_evaluated' && tQcAll.length > 0 ? [tQcAll[0]] : tQcAll;

      const qcAvg =
        tQcSelected.length > 0
          ? Number(
              (
                tQcSelected.reduce((s, q) => s + Number(q.evaluation_score || 0), 0) /
                tQcSelected.length
              ).toFixed(1)
            )
          : null;

      const tComplaints = periodComplaints.filter((c) =>
        isSameTutor(c.tutor_name || c.lesson_teacher || c.teacher_name, tutorName)
      );
      const complaintCount = tComplaints.length;

      // Composite = (Attendance + Discipline + QC) / 3
      const compositeScore = calcCompositeDividedByThree(attendancePct, disciplinePct, qcAvg);
      const status = getPerformanceStatus(compositeScore);

      return {
        tutorName,
        aliases: group.aliases,
        totalSchedules: tSchedules.length,
        conductedCount,
        totalAttended,
        totalExpected,
        attendancePct,
        fbPct,
        fbDoneCount,
        fbCount: tFb.length,
        meetPct,
        presentCount,
        excusedCount,
        absentCount,
        meetCount: tMeet.length,
        disciplinePct,
        qcAvg,
        qcCount: tQcAll.length,
        qcList: tQcAll,
        latestQcRecord: tQcAll[0] || null,
        complaintCount,
        complaintList: tComplaints,
        compositeScore,
        status,
      };
    });
  }, [
    users,
    schedules,
    feedbackAssignments,
    meetings,
    meetingAttendances,
    qcRecords,
    complaints,
    selectedMonth,
    selectedYear,
    qcMode,
  ]);

  const filteredAndSortedTutors = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tutorMetricsList.filter((item) => {
      const hasActivity =
        item.totalSchedules > 0 ||
        item.fbCount > 0 ||
        item.meetCount > 0 ||
        item.qcCount > 0 ||
        item.complaintCount > 0;
      if (!hasActivity) return false;

      if (selectedStatus !== 'all' && item.status.label !== selectedStatus) return false;
      if (q) {
        const hay = `${item.tutorName} ${item.aliases.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === 'name_asc') return a.tutorName.localeCompare(b.tutorName);
      if (sortBy === 'attendance_desc') return (b.attendancePct ?? -1) - (a.attendancePct ?? -1);
      if (sortBy === 'discipline_desc') return (b.disciplinePct ?? -1) - (a.disciplinePct ?? -1);
      if (sortBy === 'qc_desc') return (b.qcAvg ?? -1) - (a.qcAvg ?? -1);
      if (sortBy === 'complaint_desc') return b.complaintCount - a.complaintCount;
      if (sortBy === 'conducted_desc') return b.conductedCount - a.conductedCount;
      // Default: tertinggi ke terendah berdasarkan (Attendance + Discipline + QC) / 3
      const diff = (b.compositeScore ?? -1) - (a.compositeScore ?? -1);
      if (diff !== 0) return diff;
      return (b.attendancePct ?? -1) - (a.attendancePct ?? -1);
    });
  }, [tutorMetricsList, search, selectedStatus, sortBy]);

  const summaryKpis = useMemo(() => {
    const activeTutors = filteredAndSortedTutors.length;
    const totalConducted = filteredAndSortedTutors.reduce((s, t) => s + t.conductedCount, 0);

    const totalAtt = filteredAndSortedTutors.reduce((s, t) => s + t.totalAttended, 0);
    const totalExp = filteredAndSortedTutors.reduce((s, t) => s + t.totalExpected, 0);
    const avgAttendance =
      totalExp > 0 ? Number(((totalAtt / totalExp) * 100).toFixed(1)) : 0;

    const discItems = filteredAndSortedTutors.filter((t) => t.disciplinePct !== null);
    const avgDiscipline =
      discItems.length > 0
        ? Number(
            (discItems.reduce((s, t) => s + t.disciplinePct, 0) / discItems.length).toFixed(1)
          )
        : 0;

    const qcItems = filteredAndSortedTutors.filter((t) => t.qcAvg !== null);
    const avgQc =
      qcItems.length > 0
        ? Number((qcItems.reduce((s, t) => s + t.qcAvg, 0) / qcItems.length).toFixed(1))
        : 0;

    return {
      activeTutors,
      totalConducted,
      avgAttendance,
      totalAtt,
      totalExp,
      avgDiscipline,
      avgQc,
    };
  }, [filteredAndSortedTutors]);

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const rows = filteredAndSortedTutors.map((t) => ({
        Tutor: t.tutorName,
        Conducted: t.conductedCount,
        'Total Schedules': t.totalSchedules,
        'Attendance (%)': t.attendancePct ?? '-',
        'Monthly Feedback (%)': t.fbPct ?? '-',
        'Meeting Presence (%)': t.meetPct ?? '-',
        'Discipline (%)': t.disciplinePct ?? '-',
        'QC Score': t.qcAvg ?? '-',
        'QC Mode': qcMode,
        Complaints: t.complaintCount,
        'Composite ((Att+Disc+QC)/3)': t.compositeScore ?? '-',
        Status: t.status.label,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Tutor Metrics');
      XLSX.writeFile(wb, `Tutor_Metrics_${selectedMonth}_${selectedYear}.xlsx`);
      toast.success('Tutor Metrics report exported');
    } catch (err) {
      toast.error('Failed to export Tutor Metrics', { description: err.message });
    }
  };

  const activeTutor = detailModal?.tutor || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2.5">
            <Activity className="w-7 h-7 text-primary" />
            Tutor Metric
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sorted highest to lowest by (Attendance + Discipline + QC) / 3. Click any metric cell for breakdown.
          </p>
        </div>

        <Button variant="outline" onClick={handleExportExcel} className="gap-2 self-start lg:self-auto">
          <FileSpreadsheet className="w-4 h-4" /> Export Metrics Excel
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
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

          <Select value={qcMode} onValueChange={setQcMode}>
            <SelectTrigger>
              <SelectValue placeholder="QC Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest_evaluated">QC: Latest Evaluated (Month)</SelectItem>
              <SelectItem value="prev_month">QC: Last Month (SOP)</SelectItem>
              <SelectItem value="all_evaluated">QC: All Evaluated (Month)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger>
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="High Performer">High Performer (&ge;90)</SelectItem>
              <SelectItem value="Stable Performer">Stable Performer (80–89.99)</SelectItem>
              <SelectItem value="Need Improvement">Need Improvement (70–79.99)</SelectItem>
              <SelectItem value="Low Performance">Low Performance (&lt;70)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger>
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="composite_desc">Composite ((A+D+Q)/3) High–Low</SelectItem>
              <SelectItem value="attendance_desc">Attendance % (High–Low)</SelectItem>
              <SelectItem value="discipline_desc">Discipline % (High–Low)</SelectItem>
              <SelectItem value="qc_desc">QC Score (High–Low)</SelectItem>
              <SelectItem value="complaint_desc">Complaints (High–Low)</SelectItem>
              <SelectItem value="conducted_desc">Conducted Lessons (High–Low)</SelectItem>
              <SelectItem value="name_asc">Tutor Name (A–Z)</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tutor name..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* 5 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{summaryKpis.activeTutors}</div>
            <div className="text-xs font-semibold text-foreground">Active Tutors</div>
            <div className="text-[11px] text-muted-foreground">With activity in period</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <CalendarCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{summaryKpis.totalConducted}</div>
            <div className="text-xs font-semibold text-foreground">Total Conducted</div>
            <div className="text-[11px] text-muted-foreground">Valid non-test lessons</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
            <Percent className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{summaryKpis.avgAttendance}%</div>
            <div className="text-xs font-semibold text-foreground">Avg Attendance</div>
            <div className="text-[11px] text-muted-foreground">
              {summaryKpis.totalAtt}/{summaryKpis.totalExp} kids attended
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{summaryKpis.avgDiscipline}%</div>
            <div className="text-xs font-semibold text-foreground">Avg Discipline</div>
            <div className="text-[11px] text-muted-foreground">75% Feedback + 25% Meeting</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{summaryKpis.avgQc}</div>
            <div className="text-xs font-semibold text-foreground">Avg QC Quality</div>
            <div className="text-[11px] text-muted-foreground">
              {qcMode === 'prev_month'
                ? 'Last month QC (SOP)'
                : qcMode === 'latest_evaluated'
                ? 'Latest evaluated QC'
                : 'All evaluated QC'}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-5 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr className="text-left">
                <th className="py-3 font-semibold">#</th>
                <th className="py-3 font-semibold">Tutor Name</th>
                <th className="py-3 font-semibold text-center">Attendance</th>
                <th className="py-3 font-semibold text-center">Discipline</th>
                <th className="py-3 font-semibold text-center">QC</th>
                <th className="py-3 font-semibold text-center">Complaint</th>
                <th className="py-3 font-semibold text-center">
                  <span className="inline-flex items-center gap-1">
                    Composite <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="py-3 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAndSortedTutors.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-muted-foreground">
                    No tutor metric records found for the selected period.
                  </td>
                </tr>
              ) : (
                filteredAndSortedTutors.map((t, index) => (
                  <tr key={t.tutorName} className="hover:bg-secondary/30 transition-colors">
                    <td className="py-3 text-muted-foreground font-medium">{index + 1}</td>
                    <td className="py-3 font-semibold text-foreground">
                      <div>{t.tutorName}</div>
                      {t.aliases.length > 1 && (
                        <div className="text-[10px] text-muted-foreground font-normal">
                          Merged: {t.aliases.filter((a) => a !== t.tutorName).join(', ')}
                        </div>
                      )}
                    </td>

                    <td className="py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ type: 'attendance', tutor: t })}
                        className="font-bold text-teal-600 hover:underline cursor-pointer"
                      >
                        {t.attendancePct !== null ? `${t.attendancePct}%` : '-'}
                      </button>
                    </td>

                    <td className="py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ type: 'discipline', tutor: t })}
                        className="font-bold text-violet-600 hover:underline cursor-pointer"
                      >
                        {t.disciplinePct !== null ? `${t.disciplinePct}%` : '-'}
                      </button>
                    </td>

                    <td className="py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ type: 'qc', tutor: t })}
                        className="font-bold text-amber-600 hover:underline cursor-pointer"
                      >
                        {t.qcAvg !== null ? t.qcAvg : '-'}
                      </button>
                    </td>

                    <td className="py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ type: 'complaint', tutor: t })}
                        className={`font-bold hover:underline cursor-pointer ${
                          t.complaintCount > 0 ? 'text-rose-600' : 'text-foreground'
                        }`}
                      >
                        {t.complaintCount}
                      </button>
                    </td>

                    <td className="py-3 text-center">
                      <span className="text-sm font-bold text-foreground">
                        {t.compositeScore !== null ? t.compositeScore : '-'}
                      </span>
                    </td>

                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ type: 'status', tutor: t })}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap cursor-pointer hover:opacity-85 ${t.status.badgeClass}`}
                      >
                        {t.status.label}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog
        open={Boolean(detailModal)}
        onOpenChange={(open) => !open && setDetailModal(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailModal?.type === 'attendance' && <CalendarCheck className="w-5 h-5 text-teal-600" />}
              {detailModal?.type === 'discipline' && <ShieldCheck className="w-5 h-5 text-violet-600" />}
              {detailModal?.type === 'qc' && <Star className="w-5 h-5 text-amber-500" />}
              {detailModal?.type === 'complaint' && <AlertTriangle className="w-5 h-5 text-rose-600" />}
              {detailModal?.type === 'status' && <Award className="w-5 h-5 text-primary" />}
              <span>
                {activeTutor?.tutorName} —{' '}
                {detailModal?.type === 'attendance' && 'Attendance & Conducted Detail'}
                {detailModal?.type === 'discipline' && 'Discipline Breakdown'}
                {detailModal?.type === 'qc' && 'QC Evaluation Detail'}
                {detailModal?.type === 'complaint' && 'Complaint Detail'}
                {detailModal?.type === 'status' && 'Performance Status Detail'}
              </span>
            </DialogTitle>
          </DialogHeader>

          {activeTutor && detailModal?.type === 'attendance' && (
            <div className="space-y-3 text-xs pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200">
                  <div className="text-teal-700 font-medium">Attendance Ratio</div>
                  <div className="text-2xl font-bold text-teal-900 mt-0.5">
                    {activeTutor.attendancePct !== null ? `${activeTutor.attendancePct}%` : '-'}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200">
                  <div className="text-indigo-700 font-medium">Conducted Lessons</div>
                  <div className="text-2xl font-bold text-indigo-900 mt-0.5">
                    {activeTutor.conductedCount}{' '}
                    <span className="text-sm font-medium text-indigo-700">
                      / {activeTutor.totalSchedules} schedules
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-secondary border border-border flex items-center justify-between">
                <span className="text-muted-foreground font-medium">Kids Attended Ratio</span>
                <span className="font-bold text-foreground">
                  {activeTutor.totalAttended} / {activeTutor.totalExpected} kids
                </span>
              </div>
            </div>
          )}

          {activeTutor && detailModal?.type === 'discipline' && (
            <div className="space-y-3 text-xs pt-1">
              <div className="p-3.5 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-between">
                <div>
                  <div className="text-violet-700 font-medium">Combined Discipline (75% FB + 25% Meeting)</div>
                  <div className="text-[11px] text-violet-600 mt-0.5">
                    Monthly Feedback &amp; Meeting Presence weighted score
                  </div>
                </div>
                <div className="text-2xl font-bold text-violet-900">
                  {activeTutor.disciplinePct !== null ? `${activeTutor.disciplinePct}%` : '-'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-secondary border border-border space-y-1">
                  <div className="text-muted-foreground font-medium">Monthly Feedback (75%)</div>
                  <div className="text-xl font-bold text-foreground">
                    {activeTutor.fbPct !== null ? `${activeTutor.fbPct}%` : '-'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Completed: {activeTutor.fbDoneCount} / {activeTutor.fbCount} assignments
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-secondary border border-border space-y-1">
                  <div className="text-muted-foreground font-medium">Meeting Presence (25%)</div>
                  <div className="text-xl font-bold text-foreground">
                    {activeTutor.meetPct !== null ? `${activeTutor.meetPct}%` : '-'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Present: {activeTutor.presentCount} · Excused: {activeTutor.excusedCount} · Absent: {activeTutor.absentCount}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTutor && detailModal?.type === 'qc' && (
            <div className="space-y-3 text-xs pt-1">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between">
                <div>
                  <div className="text-amber-800 font-medium">
                    QC Score (
                    {qcMode === 'prev_month'
                      ? 'Last Month SOP'
                      : qcMode === 'latest_evaluated'
                      ? 'Latest Evaluated'
                      : 'All Evaluated'}
                    )
                  </div>
                  <div className="text-[11px] text-amber-700 mt-0.5">
                    {activeTutor.qcCount} evaluated QC record(s) found
                  </div>
                </div>
                <div className="text-2xl font-bold text-amber-950">
                  {activeTutor.qcAvg !== null ? activeTutor.qcAvg : '-'}
                </div>
              </div>

              {activeTutor.qcList.length > 0 ? (
                <div className="max-h-48 overflow-y-auto divide-y divide-border rounded-xl border border-border">
                  {activeTutor.qcList.map((q, i) => (
                    <div key={q.id || i} className="p-2.5 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-foreground">
                          {q.group_title || q.course || `Evaluation #${i + 1}`}
                          {qcMode === 'latest_evaluated' && i === 0 && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                              Latest
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {q.evaluation_date || `${q.period_month || '-'}/${q.period_year || '-'}`}
                        </div>
                      </div>
                      <span className="font-bold text-amber-700">{q.evaluation_score}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-secondary/40 text-muted-foreground text-center">
                  No evaluated QC records for this filter.
                </div>
              )}
            </div>
          )}

          {activeTutor && detailModal?.type === 'complaint' && (
            <div className="space-y-3 text-xs pt-1">
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between">
                <div className="text-rose-800 font-medium">Total Complaints in Period</div>
                <div className="text-2xl font-bold text-rose-900">{activeTutor.complaintCount}</div>
              </div>

              {activeTutor.complaintList.length > 0 ? (
                <div className="max-h-48 overflow-y-auto divide-y divide-border rounded-xl border border-border">
                  {activeTutor.complaintList.map((c, i) => (
                    <div key={c.id || i} className="p-2.5 space-y-0.5">
                      <div className="font-semibold text-foreground">
                        {c.title || c.category || c.reason || `Complaint #${i + 1}`}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.notes || c.description || c.status || '-'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-secondary/40 text-muted-foreground text-center">
                  No complaints recorded for this tutor in the selected period.
                </div>
              )}
            </div>
          )}

          {activeTutor && detailModal?.type === 'status' && (
            <div className="space-y-3 text-xs pt-1">
              <div className="p-3.5 rounded-xl bg-secondary border border-border flex items-center justify-between">
                <div>
                  <div className="text-muted-foreground font-medium">Composite ((Attendance + Discipline + QC) / 3)</div>
                  <div className="text-2xl font-bold text-foreground mt-0.5">
                    {activeTutor.compositeScore !== null ? activeTutor.compositeScore : '-'}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border ${activeTutor.status.badgeClass}`}
                >
                  {activeTutor.status.label}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-secondary/50 border border-border">
                  <div className="text-[11px] text-muted-foreground">Attendance</div>
                  <div className="font-bold text-teal-600 mt-0.5">
                    {activeTutor.attendancePct !== null ? `${activeTutor.attendancePct}%` : '-'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-secondary/50 border border-border">
                  <div className="text-[11px] text-muted-foreground">Discipline</div>
                  <div className="font-bold text-violet-600 mt-0.5">
                    {activeTutor.disciplinePct !== null ? `${activeTutor.disciplinePct}%` : '-'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-secondary/50 border border-border">
                  <div className="text-[11px] text-muted-foreground">QC</div>
                  <div className="font-bold text-amber-600 mt-0.5">
                    {activeTutor.qcAvg !== null ? activeTutor.qcAvg : '-'}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-secondary/30 border border-border p-3 text-[11px] text-muted-foreground space-y-1">
                <div className="font-semibold text-foreground">Status Thresholds:</div>
                <div>High Performer: &ge; 90 · Stable Performer: 80–89.99 · Need Improvement: 70–79.99 · Low Performance: &lt; 70</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}