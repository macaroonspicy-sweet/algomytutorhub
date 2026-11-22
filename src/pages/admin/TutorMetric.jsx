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

// Set ke true jika QC score selalu diambil dari bulan sebelumnya
const USE_PREV_MONTH_FOR_QC = false;

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

// Jumlah siswa seharusnya:
// - Ambil dari students_raw atau students_count jika > 0
// - Jika terbaca 0 (misal "0(0)" karena expelled) namun ada siswa hadir (attended >= 1), anggap minimal attended (1)
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

  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('composite_desc');

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
    // 1. Kumpulkan daftar unik tutor dari CustomUser + jadwal + feedback + QC
    const tutorNames = [];
    const pushUniqueTutor = (rawName) => {
      const trimmed = String(rawName || '').trim();
      if (!trimmed) return;
      const exists = tutorNames.some((existing) => isSameTutor(existing, trimmed));
      if (!exists) tutorNames.push(trimmed);
    };

    users
      .filter((u) => {
        const role = String(u.role || u.user_role || '').toLowerCase();
        return !role || role.includes('tutor') || role.includes('teacher') || role.includes('lead');
      })
      .forEach((u) => pushUniqueTutor(u.full_name || u.name || u.tutor_name));

    schedules.forEach((s) => {
      if (s.is_test_group) return;
      if (selectedYear !== 'all' && String(s.lesson_year) !== selectedYear) return;
      if (selectedMonth !== 'all' && String(s.lesson_month) !== selectedMonth) return;
      pushUniqueTutor(s.lesson_teacher);
    });

    feedbackAssignments.forEach((a) => {
      if (a.is_sample) return;
      pushUniqueTutor(a.tutor_name);
    });

    qcRecords.forEach((q) => {
      pushUniqueTutor(q.tutor_name);
    });

    // 2. Filter jadwal periode aktif
    const periodSchedules = schedules.filter((r) => {
      if (r.is_test_group) return false;
      if (selectedYear !== 'all' && String(r.lesson_year) !== selectedYear) return false;
      if (selectedMonth !== 'all' && String(r.lesson_month) !== selectedMonth) return false;
      return true;
    });

    // 3. Filter feedback periode aktif
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

    // 4. Filter meeting periode aktif
    const validMeetingIds = new Set();
    meetings.forEach((m) => {
      if (!m.meeting_date) return;
      const [y, mStr] = m.meeting_date.split('-');
      if (selectedYear !== 'all' && y !== selectedYear) return;
      if (selectedMonth !== 'all' && String(Number(mStr)) !== selectedMonth) return;
      validMeetingIds.add(m.id);
    });
    const periodMeetAtts = meetingAttendances.filter((att) => validMeetingIds.has(att.meeting_id));

    // 5. Filter QC periode aktif
    let qcTargetMonth = selectedMonth === 'all' ? null : Number(selectedMonth);
    let qcTargetYear = selectedYear === 'all' ? null : Number(selectedYear);
    if (USE_PREV_MONTH_FOR_QC && qcTargetMonth !== null && qcTargetYear !== null) {
      qcTargetMonth -= 1;
      if (qcTargetMonth === 0) {
        qcTargetMonth = 12;
        qcTargetYear -= 1;
      }
    }
    const periodQcs = qcRecords.filter((q) => {
      if (q.evaluation_score === null || q.evaluation_score === undefined) return false;
      if (qcTargetYear !== null && Number(q.period_year) !== qcTargetYear) return false;
      if (qcTargetMonth !== null && Number(q.period_month) !== qcTargetMonth) return false;
      return true;
    });

    return tutorNames.map((tutorName) => {
      // A. Conducted & Attendance Ratio
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

      // B. Discipline (75% Monthly Feedback + 25% Meeting Presence)
      const tFb = periodFeedbacks.filter((a) => isSameTutor(a.tutor_name, tutorName));
      const fbPct =
        tFb.length > 0
          ? Number((tFb.reduce((s, a) => s + getFeedbackScore(a), 0) / tFb.length).toFixed(1))
          : null;

      const tMeet = periodMeetAtts.filter((att) => isSameTutor(att.tutor_name, tutorName));
      let meetPct = null;
      if (tMeet.length > 0) {
        const present = tMeet.filter((r) => normalizeAttendanceStatus(r.status) === 'Present').length;
        const excused = tMeet.filter((r) => normalizeAttendanceStatus(r.status) === 'Excused').length;
        meetPct = Number((((present * 1 + excused * 0.75) / tMeet.length) * 100).toFixed(1));
      }

      let disciplinePct = null;
      if (fbPct !== null && meetPct !== null) {
        disciplinePct = Number((fbPct * FEEDBACK_WEIGHT + meetPct * MEETING_WEIGHT).toFixed(1));
      } else if (fbPct !== null) {
        disciplinePct = fbPct;
      } else if (meetPct !== null) {
        disciplinePct = meetPct;
      }

      // C. Quality (QC Score)
      const tQc = periodQcs.filter((q) => isSameTutor(q.tutor_name, tutorName));
      const qcAvg =
        tQc.length > 0
          ? Number(
              (
                tQc.reduce((s, q) => s + Number(q.evaluation_score || 0), 0) / tQc.length
              ).toFixed(1)
            )
          : null;

      // D. Composite Score (rata-rata komponen aktif yang tersedia)
      const components = [attendancePct, disciplinePct, qcAvg].filter(
        (v) => v !== null && v !== undefined && !Number.isNaN(v)
      );
      const compositeScore =
        components.length > 0
          ? Number((components.reduce((a, b) => a + b, 0) / components.length).toFixed(1))
          : null;

      const status = getPerformanceStatus(compositeScore);

      return {
        tutorName,
        totalSchedules: tSchedules.length,
        conductedCount,
        totalAttended,
        totalExpected,
        attendancePct,
        fbPct,
        fbCount: tFb.length,
        meetPct,
        meetCount: tMeet.length,
        disciplinePct,
        qcAvg,
        qcCount: tQc.length,
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
    selectedMonth,
    selectedYear,
  ]);

  const filteredAndSortedTutors = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tutorMetricsList.filter((item) => {
      // Sembunyikan tutor yang tidak punya aktivitas sama sekali pada filter aktif
      const hasActivity =
        item.totalSchedules > 0 || item.fbCount > 0 || item.meetCount > 0 || item.qcCount > 0;
      if (!hasActivity) return false;

      if (selectedStatus !== 'all' && item.status.label !== selectedStatus) return false;
      if (q && !item.tutorName.toLowerCase().includes(q)) return false;
      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === 'name_asc') return a.tutorName.localeCompare(b.tutorName);
      if (sortBy === 'attendance_desc') return (b.attendancePct ?? -1) - (a.attendancePct ?? -1);
      if (sortBy === 'discipline_desc') return (b.disciplinePct ?? -1) - (a.disciplinePct ?? -1);
      if (sortBy === 'qc_desc') return (b.qcAvg ?? -1) - (a.qcAvg ?? -1);
      if (sortBy === 'conducted_desc') return b.conductedCount - a.conductedCount;
      return (b.compositeScore ?? -1) - (a.compositeScore ?? -1);
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
        'Attended / Expected': `${t.totalAttended}/${t.totalExpected}`,
        'Attendance (%)': t.attendancePct ?? '-',
        'Monthly Feedback (%)': t.fbPct ?? '-',
        'Meeting Presence (%)': t.meetPct ?? '-',
        'Discipline (%)': t.disciplinePct ?? '-',
        'QC Avg': t.qcAvg ?? '-',
        'Composite Score': t.compositeScore ?? '-',
        Status: t.status.label,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Tutor Metrics');
      XLSX.writeFile(wb, `Tutor_Metrics_${selectedMonth}_${selectedYear}.xlsx`);
      toast.success('Tutor Metrics report exported');
    } catch (err) {
      toast.error('Failed to export Tutor Metrics', { description: err.message });
    }
  };

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
            Composite tutor performance across Student Attendance ratio, Discipline (75% Feedback + 25% Meeting), and QC Evaluation.
          </p>
        </div>

        <Button variant="outline" onClick={handleExportExcel} className="gap-2 self-start lg:self-auto">
          <FileSpreadsheet className="w-4 h-4" /> Export Metrics Excel
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
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
              <SelectItem value="composite_desc">Composite Score (High–Low)</SelectItem>
              <SelectItem value="attendance_desc">Attendance % (High–Low)</SelectItem>
              <SelectItem value="discipline_desc">Discipline % (High–Low)</SelectItem>
              <SelectItem value="qc_desc">QC Quality (High–Low)</SelectItem>
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
            <div className="text-[11px] text-muted-foreground">Mean evaluation score</div>
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
                <th className="py-3 font-semibold text-center">Conducted</th>
                <th className="py-3 font-semibold text-center">Attendance Ratio</th>
                <th className="py-3 font-semibold text-center">Discipline (75/25)</th>
                <th className="py-3 font-semibold text-center">Quality (QC)</th>
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
                    <td className="py-3 font-semibold text-foreground">{t.tutorName}</td>
                    <td className="py-3 text-center">
                      <span className="font-semibold text-indigo-600">{t.conductedCount}</span>
                      <span className="text-muted-foreground">/{t.totalSchedules}</span>
                    </td>
                    <td className="py-3 text-center">
                      {t.attendancePct !== null ? (
                        <div>
                          <div className="font-bold text-teal-600">{t.attendancePct}%</div>
                          <div className="text-[10px] text-muted-foreground">
                            {t.totalAttended}/{t.totalExpected} kids
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {t.disciplinePct !== null ? (
                        <div>
                          <div className="font-bold text-violet-600">{t.disciplinePct}%</div>
                          <div className="text-[10px] text-muted-foreground">
                            FB: {t.fbPct ?? '-'}% · Mt: {t.meetPct ?? '-'}%
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {t.qcAvg !== null ? (
                        <div>
                          <div className="font-bold text-amber-600">{t.qcAvg}</div>
                          <div className="text-[10px] text-muted-foreground">{t.qcCount} QC</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      <span className="text-sm font-bold text-foreground">
                        {t.compositeScore !== null ? t.compositeScore : '-'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap ${t.status.badgeClass}`}
                      >
                        {t.status.label}
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
  );
}