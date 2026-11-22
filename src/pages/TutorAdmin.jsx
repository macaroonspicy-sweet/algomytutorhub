import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  BarChart2,
  CalendarCheck,
  Percent,
  ShieldCheck,
  Star,
  BookOpen,
  Users,
  Sparkles,
  Bell,
  Search,
  FileSpreadsheet,
  Upload,
  Loader2,
  ArrowUpRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
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

// Set ke true jika ingin QC Result Avg selalu membaca hasil QC bulan sebelumnya (SOP TutorMetric)
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

const getWeekBucket = (dateStr) => {
  if (!dateStr) return 'W1';
  const day = Number(String(dateStr).split('-')[2] || 1);
  if (day <= 7) return 'W1';
  if (day <= 14) return 'W2';
  if (day <= 21) return 'W3';
  return 'W4';
};

const getCourseLabel = (r) => {
  const direct =
    r.course_name ||
    r.course ||
    r.program_name ||
    r.program ||
    r.subject ||
    r.track ||
    r.course_title;
  if (direct && String(direct).trim()) return String(direct).trim();

  // Fallback ekstraksi dari group_code bila kolom course kosong (misal: "MY 1-1 VP 020" -> "VP")[cite: 7]
  const code = String(r.group_code || '').trim();
  const match = code.match(/\b(VP|PS|PP|GDJ|GDS|GD|RB|DL|BW|AI|WEB|PY)\b/i);
  if (match) return match[1].toUpperCase();

  return 'Uncategorized';
};

const normalizeFormat = (raw) => {
  const f = String(raw || '').toLowerCase();
  if (f.includes('intens')) return 'Intensive';
  if (f.includes('indiv') || f.includes('1-1') || f.includes('1on1') || f.includes('private')) {
    return 'Individual';
  }
  return 'Group';
};

const getGroupFormat = (r) => {
  const rawFormat =
    r.group_format ||
    r.course_format ||
    r.class_format ||
    r.format ||
    r.class_type ||
    r.type ||
    r.group_code ||
    '';
  return normalizeFormat(rawFormat);
};

const pickCell = (row, keys) => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return row[k];
    }
  }
  return '';
};

const parseIsoDate = (rawVal) => {
  if (!rawVal) return null;
  if (rawVal instanceof Date && !Number.isNaN(rawVal.getTime())) {
    return rawVal.toISOString().slice(0, 10);
  }
  const str = String(rawVal).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
};

function MiniSparkline({ data, dataKey = 'value', stroke = '#6366f1' }) {
  return (
    <div className="w-24 h-11 flex-shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={stroke}
            strokeWidth={2.2}
            dot={{ r: 2.5, fill: '#fff', stroke, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HeroBentoCard({
  icon: Icon,
  iconBg,
  value,
  title,
  subtitle,
  sparkData,
  sparkStroke,
  progressPct = 0,
  barColor,
  badges = [],
  onViewChart,
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl xl:text-[26px] font-bold text-foreground leading-tight tracking-tight">
              {value}
            </div>
            <div className="text-xs font-semibold text-foreground mt-0.5 truncate">{title}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</div>
          </div>
        </div>
        <MiniSparkline data={sparkData} stroke={sparkStroke} />
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
            />
          </div>
          <button
            type="button"
            onClick={onViewChart}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors whitespace-nowrap"
          >
            View Chart <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {badges.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {badges.map((b, idx) => (
              <span
                key={idx}
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border whitespace-nowrap ${b.className}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TutorAdmin() {
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [totalDbRows, setTotalDbRows] = useState(0);
  const [feedbackAssignments, setFeedbackAssignments] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [meetingAttendances, setMeetingAttendances] = useState([]);
  const [qcRecords, setQcRecords] = useState([]);

  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedWeek, setSelectedWeek] = useState('all');
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [selectedTutor, setSelectedTutor] = useState('all');
  const [search, setSearch] = useState('');
  const [showTestGroups, setShowTestGroups] = useState(false);

  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'groups' | 'lesson1' | 'log'
  const [chartModal, setChartModal] = useState(null); // 'conducted' | 'attendance' | 'discipline' | 'qc' | null

  const loadData = async () => {
    setLoading(true);
    try {
      let allSched = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error, count } = await supabase
          .from('BoScheduleRecord')
          .select('*', { count: 'exact' })
          .range(from, from + step - 1);
        if (error) throw error;
        if (count !== null) setTotalDbRows(count);
        if (!data || data.length === 0) break;
        allSched = allSched.concat(data);
        if (data.length < step) break;
        from += step;
      }
      setSchedules(allSched);

      const [fbRes, meetRes, attRes, qcRes] = await Promise.all([
        supabase.from('WeeklyFeedbackAssignment').select('*'),
        supabase.from('TutorMeeting').select('*'),
        supabase.from('TutorMeetingAttendance').select('*'),
        supabase.from('QCRecord').select('*'),
      ]);

      if (fbRes.error) console.error('WeeklyFeedbackAssignment error:', fbRes.error);
      if (meetRes.error) console.error('TutorMeeting error:', meetRes.error);
      if (attRes.error) console.error('TutorMeetingAttendance error:', attRes.error);
      if (qcRes.error) console.error('QCRecord error:', qcRes.error);

      setFeedbackAssignments(fbRes.data || []);
      setMeetings(meetRes.data || []);
      setMeetingAttendances(attRes.data || []);
      setQcRecords((qcRes.data || []).filter((q) => !q.is_sample));
    } catch (err) {
      toast.error('Failed to load Tutor Administration data', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleImportClick = () => {
    if (importing) return;
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

      if (!rows || rows.length === 0) {
        toast.warning('No rows found in the imported file');
        return;
      }

      const mappedRows = rows
        .map((row) => {
          const rawDate = pickCell(row, ['lesson_date', 'date', 'Lesson Date', 'Date']);
          const isoDate = parseIsoDate(rawDate);
          const dateParts = isoDate ? isoDate.split('-') : [];

          const lessonYear =
            Number(pickCell(row, ['lesson_year', 'year', 'Year'])) ||
            (dateParts[0] ? Number(dateParts[0]) : Number(selectedYear) || 2026);
          const lessonMonth =
            Number(pickCell(row, ['lesson_month', 'month', 'Month'])) ||
            (dateParts[1] ? Number(dateParts[1]) : Number(selectedMonth) || 11);

          const groupCode = String(
            pickCell(row, ['group_code', 'Group Code', 'group', 'Group', 'class_code', 'Class'])
          ).trim();
          const groupId = String(
            pickCell(row, ['group_id', 'Group ID', 'id', 'ID'])
          ).trim();
          const courseName = String(
            pickCell(row, ['course_name', 'course', 'Course', 'program', 'Program', 'subject'])
          ).trim();
          const lessonTeacher = String(
            pickCell(row, ['lesson_teacher', 'teacher', 'Teacher', 'tutor', 'Tutor', 'tutor_name'])
          ).trim();

          const rawConducted = String(
            pickCell(row, ['is_conducted', 'conducted', 'Conducted', 'status', 'Status'])
          )
            .trim()
            .toLowerCase();
          const isConducted =
            rawConducted === 'true' ||
            rawConducted === '1' ||
            rawConducted === 'yes' ||
            rawConducted === 'conducted' ||
            rawConducted === 'completed';

          const studentsAttended =
            Number(pickCell(row, ['students_attended', 'attended', 'Attended', 'present'])) || 0;
          const studentsCount =
            Number(pickCell(row, ['students_count', 'enrolled', 'Enrolled', 'total_students'])) || 0;
          const lessonNumberRaw = pickCell(row, ['lesson_number', 'lesson', 'Lesson', 'lesson_no']);
          const lessonNumber =
            lessonNumberRaw !== '' && !Number.isNaN(Number(lessonNumberRaw))
              ? Number(lessonNumberRaw)
              : null;

          const isTestGroup =
            String(groupCode).toLowerCase().includes('test') ||
            String(pickCell(row, ['is_test_group', 'test_group'])).toLowerCase() === 'true';

          if (!groupCode && !groupId && !lessonTeacher && !isoDate) return null;

          return {
            lesson_date: isoDate,
            lesson_year: lessonYear,
            lesson_month: lessonMonth,
            group_code: groupCode || null,
            group_id: groupId || null,
            course_name: courseName || null,
            lesson_teacher: lessonTeacher || null,
            is_conducted: isConducted,
            students_attended: studentsAttended,
            students_count: studentsCount > 0 ? studentsCount : null,
            lesson_number: lessonNumber,
            is_test_group: isTestGroup,
          };
        })
        .filter(Boolean);

      if (mappedRows.length === 0) {
        toast.warning('No valid schedule rows matched the expected columns');
        return;
      }

      const chunkSize = 500;
      for (let i = 0; i < mappedRows.length; i += chunkSize) {
        const chunk = mappedRows.slice(i, i + chunkSize);
        const { error } = await supabase.from('BoScheduleRecord').insert(chunk);
        if (error) throw error;
      }

      toast.success(`Imported ${mappedRows.length} BO schedule rows successfully`);
      await loadData();
    } catch (err) {
      toast.error('Failed to import CSV / Excel BO', { description: err.message });
    } finally {
      setImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  const courseOptions = useMemo(() => {
    const set = new Set();
    schedules.forEach((s) => {
      const c = getCourseLabel(s);
      if (c && c !== 'Uncategorized') set.add(c);
    });
    return Array.from(set).sort();
  }, [schedules]);

  const tutorOptions = useMemo(() => {
    const set = new Set();
    schedules.forEach((s) => {
      if (s.lesson_teacher) set.add(s.lesson_teacher);
    });
    return Array.from(set).sort();
  }, [schedules]);

  // Filter Schedule Records
  const filteredSchedules = useMemo(() => {
    return schedules.filter((r) => {
      if (!showTestGroups && r.is_test_group) return false;
      if (selectedYear !== 'all' && String(r.lesson_year) !== selectedYear) return false;
      if (selectedMonth !== 'all' && String(r.lesson_month) !== selectedMonth) return false;
      if (selectedWeek !== 'all' && getWeekBucket(r.lesson_date) !== selectedWeek) return false;
      if (selectedCourse !== 'all' && getCourseLabel(r) !== selectedCourse) return false;
      if (selectedTutor !== 'all' && !isSameTutor(r.lesson_teacher, selectedTutor)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${r.group_code || ''} ${r.group_id || ''} ${r.lesson_teacher || ''} ${getCourseLabel(r)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    schedules,
    showTestGroups,
    selectedYear,
    selectedMonth,
    selectedWeek,
    selectedCourse,
    selectedTutor,
    search,
  ]);

  // 1 & 2. Lessons Conducted & Student Attendance KPIs
  const scheduleMetrics = useMemo(() => {
    const totalSchedules = filteredSchedules.length;
    const conductedList = filteredSchedules.filter((r) => r.is_conducted);
    const conductedCount = conductedList.length;
    const completionPct =
      totalSchedules > 0 ? Math.round((conductedCount / totalSchedules) * 100) : 0;

    const totalAttended = conductedList.reduce(
      (sum, r) => sum + (Number(r.students_attended) || 0),
      0
    );
    const totalEnrolled = conductedList.reduce(
      (sum, r) => sum + parseEnrolledCount(r),
      0
    );
    const attendancePct =
      conductedCount > 0 && totalEnrolled > 0
        ? Number(((totalAttended / totalEnrolled) * 100).toFixed(1))
        : 0;

    // Weekly breakdown (W1 - W4)
    const weeks = ['W1', 'W2', 'W3', 'W4'];
    const weekLabels = {
      W1: 'Week 1 (1–7)',
      W2: 'Week 2 (8–14)',
      W3: 'Week 3 (15–21)',
      W4: 'Week 4 (22–End)',
    };

    const weeklyBreakdown = weeks.map((wk) => {
      const items = conductedList.filter((r) => getWeekBucket(r.lesson_date) === wk);
      let group = 0;
      let indiv = 0;
      let intensive = 0;
      let att = 0;
      let enr = 0;

      items.forEach((r) => {
        const fmt = getGroupFormat(r);
        if (fmt === 'Group') group += 1;
        else if (fmt === 'Individual') indiv += 1;
        else intensive += 1;
        att += Number(r.students_attended) || 0;
        enr += parseEnrolledCount(r);
      });

      const pct = enr > 0 ? Number(((att / enr) * 100).toFixed(1)) : 0;
      return {
        week: wk,
        period: weekLabels[wk],
        conducted: items.length,
        group,
        indiv,
        intensive,
        attended: att,
        enrolled: enr,
        avgPct: pct,
      };
    });

    // Active classes & kids per course
    const classMap = new Map();
    const courseMap = new Map();
    let lesson1Count = 0;
    const lesson1Courses = new Set();
    let fourthLessonCount = 0;

    filteredSchedules.forEach((r) => {
      const cName = getCourseLabel(r);
      const classKey = r.group_code || r.group_id || `${cName}-${r.lesson_teacher}-${r.id}`;
      const kids = parseEnrolledCount(r);
      if (!classMap.has(classKey)) {
        classMap.set(classKey, {
          classKey,
          groupCode: r.group_code || '-',
          courseName: cName,
          teacher: r.lesson_teacher || '-',
          format: getGroupFormat(r),
          kids,
          conducted: r.is_conducted ? 1 : 0,
        });
      } else {
        const existing = classMap.get(classKey);
        existing.kids = Math.max(existing.kids, kids);
        if (r.is_conducted) existing.conducted += 1;
      }

      const lNum = Number(r.lesson_number);
      if (lNum === 1) {
        lesson1Count += 1;
        if (cName && cName !== 'Uncategorized') lesson1Courses.add(cName);
      }
      if (!Number.isNaN(lNum) && lNum > 0 && lNum % 4 === 0) {
        fourthLessonCount += 1;
      }
    });

    classMap.forEach((cls) => {
      const prev = courseMap.get(cls.courseName) || {
        course: cls.courseName,
        classes: 0,
        totalKids: 0,
        conducted: 0,
      };
      prev.classes += 1;
      prev.totalKids += cls.kids;
      prev.conducted += cls.conducted;
      courseMap.set(cls.courseName, prev);
    });

    const totalKids = Array.from(classMap.values()).reduce((s, c) => s + c.kids, 0);
    const courseDistribution = Array.from(courseMap.values()).sort(
      (a, b) => b.classes - a.classes
    );

    return {
      totalSchedules,
      conductedCount,
      completionPct,
      totalAttended,
      totalEnrolled,
      attendancePct,
      weeklyBreakdown,
      activeClasses: Array.from(classMap.values()),
      totalKids,
      lesson1Count,
      lesson1DistinctCourses: lesson1Courses.size,
      fourthLessonCount,
      courseDistribution,
    };
  }, [filteredSchedules]);

  // 3. Discipline KPI (75% Monthly Feedback + 25% Meeting Presence)
  const disciplineMetrics = useMemo(() => {
    const filteredFb = feedbackAssignments.filter((a) => {
      if (a.is_sample) return false;
      if (String(a.status || '').toLowerCase() === 'rescheduled') return false;
      if (!isLessonFourMultiple(a)) return false;
      const aCourse = getCourseLabel(a);
      if (selectedCourse !== 'all' && aCourse !== 'Uncategorized' && aCourse !== selectedCourse) {
        return false;
      }
      if (selectedTutor !== 'all' && !isSameTutor(a.tutor_name, selectedTutor)) return false;

      if (a.week_start_date) {
        const [ay, am] = a.week_start_date.split('-');
        if (selectedYear !== 'all' && ay !== selectedYear) return false;
        if (selectedMonth !== 'all' && String(Number(am)) !== selectedMonth) return false;
        if (selectedWeek !== 'all' && getWeekBucket(a.week_start_date) !== selectedWeek) return false;
      }
      return true;
    });

    const fbTotal = filteredFb.length;
    const fbDone = filteredFb.filter(isAssignmentCompleted).length;
    const fbPct = fbTotal > 0 ? Number(((fbDone / fbTotal) * 100).toFixed(1)) : null;

    const validMeetingMap = new Map();
    meetings.forEach((m) => {
      if (!m.meeting_date) return;
      const [y, mStr] = m.meeting_date.split('-');
      if (selectedYear !== 'all' && y !== selectedYear) return;
      if (selectedMonth !== 'all' && String(Number(mStr)) !== selectedMonth) return;
      if (selectedWeek !== 'all' && getWeekBucket(m.meeting_date) !== selectedWeek) return;
      validMeetingMap.set(m.id, m);
    });

    const filteredMeetAtt = meetingAttendances.filter((att) => {
      if (!validMeetingMap.has(att.meeting_id)) return false;
      if (selectedTutor !== 'all' && !isSameTutor(att.tutor_name, selectedTutor)) return false;
      return true;
    });

    let meetPct = null;
    let presentCount = 0;
    let excusedCount = 0;
    if (filteredMeetAtt.length > 0) {
      presentCount = filteredMeetAtt.filter(
        (r) => normalizeAttendanceStatus(r.status) === 'Present'
      ).length;
      excusedCount = filteredMeetAtt.filter(
        (r) => normalizeAttendanceStatus(r.status) === 'Excused'
      ).length;
      meetPct = Number(
        (((presentCount * 1 + excusedCount * 0.75) / filteredMeetAtt.length) * 100).toFixed(1)
      );
    }

    let overallPct = null;
    if (fbPct !== null && meetPct !== null) {
      overallPct = Number((fbPct * FEEDBACK_WEIGHT + meetPct * MEETING_WEIGHT).toFixed(1));
    } else if (fbPct !== null) {
      overallPct = fbPct;
    } else if (meetPct !== null) {
      overallPct = meetPct;
    }

    const weeks = ['W1', 'W2', 'W3', 'W4'];
    const weeklyTrend = weeks.map((wk) => {
      const wFb = filteredFb.filter((a) => getWeekBucket(a.week_start_date) === wk);
      const wFbPct =
        wFb.length > 0 ? (wFb.filter(isAssignmentCompleted).length / wFb.length) * 100 : null;

      const wMeet = filteredMeetAtt.filter((att) => {
        const mObj = validMeetingMap.get(att.meeting_id);
        return mObj && getWeekBucket(mObj.meeting_date) === wk;
      });
      let wMeetPct = null;
      if (wMeet.length > 0) {
        const p = wMeet.filter((r) => normalizeAttendanceStatus(r.status) === 'Present').length;
        const e = wMeet.filter((r) => normalizeAttendanceStatus(r.status) === 'Excused').length;
        wMeetPct = ((p * 1 + e * 0.75) / wMeet.length) * 100;
      }

      let val = overallPct ?? 0;
      if (wFbPct !== null && wMeetPct !== null) {
        val = Number((wFbPct * FEEDBACK_WEIGHT + wMeetPct * MEETING_WEIGHT).toFixed(1));
      } else if (wFbPct !== null) {
        val = Number(wFbPct.toFixed(1));
      } else if (wMeetPct !== null) {
        val = Number(wMeetPct.toFixed(1));
      }

      return {
        week: wk,
        value: val,
        feedback: wFbPct !== null ? Number(wFbPct.toFixed(1)) : 0,
        meeting: wMeetPct !== null ? Number(wMeetPct.toFixed(1)) : 0,
      };
    });

    return {
      overallPct,
      fbPct,
      fbDone,
      fbTotal,
      meetPct,
      presentCount,
      excusedCount,
      meetTotal: filteredMeetAtt.length,
      weeklyTrend,
    };
  }, [
    feedbackAssignments,
    meetings,
    meetingAttendances,
    selectedYear,
    selectedMonth,
    selectedWeek,
    selectedCourse,
    selectedTutor,
  ]);

  // 4. QC Result Avg KPI (Period 1 vs Period 2)
  const qcMetrics = useMemo(() => {
    let targetMonth = selectedMonth === 'all' ? null : Number(selectedMonth);
    let targetYear = selectedYear === 'all' ? null : Number(selectedYear);

    if (USE_PREV_MONTH_FOR_QC && targetMonth !== null && targetYear !== null) {
      targetMonth -= 1;
      if (targetMonth === 0) {
        targetMonth = 12;
        targetYear -= 1;
      }
    }

    const filteredQc = qcRecords.filter((q) => {
      if (q.evaluation_score === null || q.evaluation_score === undefined) return false;
      if (targetYear !== null && Number(q.period_year) !== targetYear) return false;
      if (targetMonth !== null && Number(q.period_month) !== targetMonth) return false;
      const qCourse = getCourseLabel(q);
      if (selectedCourse !== 'all' && qCourse !== 'Uncategorized' && qCourse !== selectedCourse) {
        return false;
      }
      if (selectedTutor !== 'all' && !isSameTutor(q.tutor_name, selectedTutor)) return false;
      return true;
    });

    const calcAvg = (arr) =>
      arr.length > 0
        ? Number(
            (arr.reduce((sum, q) => sum + Number(q.evaluation_score || 0), 0) / arr.length).toFixed(1)
          )
        : null;

    const p1List = filteredQc.filter((q) => {
      const p = String(q.period || q.qc_period || '').toLowerCase();
      if (p.includes('1') && !p.includes('2')) return true;
      const day = Number(String(q.evaluation_date || q.created_at || '').split('-')[2] || 1);
      return day <= 15;
    });

    const p2List = filteredQc.filter((q) => {
      const p = String(q.period || q.qc_period || '').toLowerCase();
      if (p.includes('2')) return true;
      const day = Number(String(q.evaluation_date || q.created_at || '').split('-')[2] || 16);
      return day > 15;
    });

    const overallAvg = calcAvg(filteredQc);
    const p1Avg = calcAvg(p1List);
    const p2Avg = calcAvg(p2List);

    const periodTrend = [
      { period: 'Period 1 (1–15)', value: p1Avg ?? overallAvg ?? 0, count: p1List.length },
      { period: 'Period 2 (16–End)', value: p2Avg ?? overallAvg ?? 0, count: p2List.length },
    ];

    return {
      overallAvg,
      totalCount: filteredQc.length,
      p1Avg,
      p1Count: p1List.length,
      p2Avg,
      p2Count: p2List.length,
      periodTrend,
      records: filteredQc,
    };
  }, [qcRecords, selectedMonth, selectedYear, selectedCourse, selectedTutor]);

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const summaryRows = [
        { Metric: 'Lessons Conducted', Value: scheduleMetrics.conductedCount, Detail: `Out of ${scheduleMetrics.totalSchedules} schedules (${scheduleMetrics.completionPct}%)` },
        { Metric: 'Student Attendance', Value: `${scheduleMetrics.attendancePct}%`, Detail: `${scheduleMetrics.totalAttended} / ${scheduleMetrics.totalEnrolled} students attended` },
        { Metric: 'Discipline (75/25)', Value: disciplineMetrics.overallPct !== null ? `${disciplineMetrics.overallPct}%` : '-', Detail: `Monthly Feedback: ${disciplineMetrics.fbPct ?? '-'}% | Meeting Presence: ${disciplineMetrics.meetPct ?? '-'}%` },
        { Metric: 'QC Result Avg', Value: qcMetrics.overallAvg ?? '-', Detail: `Period 1: ${qcMetrics.p1Avg ?? '-'} (${qcMetrics.p1Count}) | Period 2: ${qcMetrics.p2Avg ?? '-'} (${qcMetrics.p2Count})` },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'KPI Summary');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scheduleMetrics.weeklyBreakdown), 'Weekly Attendance');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scheduleMetrics.courseDistribution), 'Course Distribution');
      XLSX.writeFile(wb, `Tutor_Administration_${selectedMonth}_${selectedYear}.xlsx`);
      toast.success('Tutor Administration report downloaded');
    } catch (err) {
      toast.error('Export failed', { description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleImportFile}
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2.5">
            <BarChart2 className="w-7 h-7 text-primary" />
            Tutor Administration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            BO LMS attendance summary, group classes, kids per course, monthly Lesson 1, &amp; every 4th-lesson Weekly Report.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" onClick={handleExportExcel} className="gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </Button>
          <Button
            type="button"
            onClick={handleImportClick}
            disabled={importing}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {importing ? 'Importing...' : 'Import CSV / Excel BO'}
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
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

          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger>
              <SelectValue placeholder="Week" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Weeks (W1–W4)</SelectItem>
              <SelectItem value="W1">Week 1 (1–7)</SelectItem>
              <SelectItem value="W2">Week 2 (8–14)</SelectItem>
              <SelectItem value="W3">Week 3 (15–21)</SelectItem>
              <SelectItem value="W4">Week 4 (22–End)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger>
              <SelectValue placeholder="All Courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courseOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedTutor} onValueChange={setSelectedTutor}>
            <SelectTrigger>
              <SelectValue placeholder="All Tutors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tutors</SelectItem>
              {tutorOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search class / ID / tutor"
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pt-1">
          <div>
            Showing <strong className="text-foreground">{scheduleMetrics.totalSchedules}</strong> schedules (
            <strong className="text-foreground">{scheduleMetrics.conductedCount}</strong> valid conducted lessons) · Total database:{' '}
            <strong className="text-foreground">{totalDbRows}</strong> rows
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showTestGroups}
              onChange={(e) => setShowTestGroups(e.target.checked)}
              className="rounded border-border"
            />
            <span>Show Test Groups</span>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* ROW 1: 4 HERO METRIC CARDS SEJAJAR */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* 1. Lessons Conducted */}
            <HeroBentoCard
              icon={CalendarCheck}
              iconBg="bg-indigo-600"
              value={scheduleMetrics.conductedCount}
              title="Lessons Conducted"
              subtitle={`Out of ${scheduleMetrics.totalSchedules} schedules (${scheduleMetrics.completionPct}%)`}
              sparkData={scheduleMetrics.weeklyBreakdown.map((w) => ({ name: w.week, value: w.conducted }))}
              sparkStroke="#4f46e5"
              progressPct={scheduleMetrics.completionPct}
              barColor="bg-indigo-600"
              onViewChart={() => setChartModal('conducted')}
            />

            {/* 2. Student Attendance */}
            <HeroBentoCard
              icon={Percent}
              iconBg="bg-teal-600"
              value={`${scheduleMetrics.attendancePct}%`}
              title="Student Attendance"
              subtitle={`${scheduleMetrics.totalAttended.toLocaleString()} / ${scheduleMetrics.totalEnrolled.toLocaleString()} kids attended`}
              sparkData={scheduleMetrics.weeklyBreakdown.map((w) => ({ name: w.week, value: w.avgPct }))}
              sparkStroke="#0d9488"
              progressPct={scheduleMetrics.attendancePct}
              barColor="bg-teal-600"
              onViewChart={() => setChartModal('attendance')}
            />

            {/* 3. Discipline (75% Monthly Feedback + 25% Meeting Presence) */}
            <HeroBentoCard
              icon={ShieldCheck}
              iconBg="bg-violet-600"
              value={disciplineMetrics.overallPct !== null ? `${disciplineMetrics.overallPct}%` : '-'}
              title="Discipline"
              subtitle="75% Monthly Feedback + 25% Meeting"
              sparkData={disciplineMetrics.weeklyTrend}
              sparkStroke="#7c3aed"
              progressPct={disciplineMetrics.overallPct ?? 0}
              barColor="bg-violet-600"
              badges={[
                {
                  label: `Monthly Feedback: ${disciplineMetrics.fbPct !== null ? `${disciplineMetrics.fbPct}%` : '-'}`,
                  className: 'bg-violet-50 text-violet-700 border-violet-200',
                },
                {
                  label: `Meeting Presence: ${disciplineMetrics.meetPct !== null ? `${disciplineMetrics.meetPct}%` : '-'}`,
                  className: 'bg-sky-50 text-sky-700 border-sky-200',
                },
              ]}
              onViewChart={() => setChartModal('discipline')}
            />

            {/* 4. QC Result Avg (Period 1 vs Period 2) */}
            <HeroBentoCard
              icon={Star}
              iconBg="bg-amber-500"
              value={qcMetrics.overallAvg !== null ? qcMetrics.overallAvg : '-'}
              title="QC Result Avg"
              subtitle={`${qcMetrics.totalCount} QC evaluations recorded`}
              sparkData={qcMetrics.periodTrend}
              sparkStroke="#f59e0b"
              progressPct={qcMetrics.overallAvg ?? 0}
              barColor="bg-amber-500"
              badges={[
                {
                  label: `Period 1: ${qcMetrics.p1Avg !== null ? qcMetrics.p1Avg : '-'}`,
                  className: 'bg-amber-50 text-amber-800 border-amber-200',
                },
                {
                  label: `Period 2: ${qcMetrics.p2Avg !== null ? qcMetrics.p2Avg : '-'}`,
                  className: 'bg-orange-50 text-orange-800 border-orange-200',
                },
              ]}
              onViewChart={() => setChartModal('qc')}
            />
          </div>

          {/* ROW 2: 4 SECONDARY CARDS SEJAJAR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div
              onClick={() => setActiveTab('groups')}
              className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xl font-bold text-foreground">{scheduleMetrics.activeClasses.length}</div>
                  <div className="text-xs font-semibold text-foreground">Active Classes</div>
                  <div className="text-[11px] text-muted-foreground">Group / Individual / Intensive</div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
            </div>

            <div
              onClick={() => setActiveTab('groups')}
              className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-indigo-500 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xl font-bold text-foreground">{scheduleMetrics.totalKids}</div>
                  <div className="text-xs font-semibold text-foreground">Total Kids</div>
                  <div className="text-[11px] text-muted-foreground">Accumulated students per class</div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
            </div>

            <div
              onClick={() => setActiveTab('lesson1')}
              className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xl font-bold text-foreground">{scheduleMetrics.lesson1Count}</div>
                  <div className="text-xs font-semibold text-foreground">Lesson 1 This Month</div>
                  <div className="text-[11px] text-muted-foreground">
                    {scheduleMetrics.lesson1DistinctCourses} distinct courses
                  </div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
            </div>

            <div
              onClick={() => setActiveTab('log')}
              className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-rose-500 flex items-center justify-center flex-shrink-0">
                  <Bell className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xl font-bold text-foreground">{scheduleMetrics.fourthLessonCount}</div>
                  <div className="text-xs font-semibold text-foreground">Every 4th Lesson</div>
                  <div className="text-[11px] text-muted-foreground">Lesson 4, 8, 12, 16...</div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          {/* TABS */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'summary'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              Weekly &amp; Course Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('groups')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'groups'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              Group Classes &amp; Kids ({scheduleMetrics.activeClasses.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('lesson1')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'lesson1'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              Lesson 1 This Month ({scheduleMetrics.lesson1Count})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('log')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'log'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              Schedule Log ({scheduleMetrics.totalSchedules})
            </button>
          </div>

          {/* TAB CONTENT */}
          {activeTab === 'summary' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-semibold text-foreground text-base">Attendance &amp; Lessons per Week</h3>
                <p className="text-xs text-muted-foreground mt-0.5 mb-4">
                  Valid criteria: non-Test Group, Conducted lessons, and cumulative student attendance ratio.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-2.5 font-semibold">Period</th>
                        <th className="py-2.5 font-semibold text-center">Conducted</th>
                        <th className="py-2.5 font-semibold text-center">Group</th>
                        <th className="py-2.5 font-semibold text-center">Indiv</th>
                        <th className="py-2.5 font-semibold text-center">Intensive</th>
                        <th className="py-2.5 font-semibold text-center">Attended</th>
                        <th className="py-2.5 font-semibold text-right">Avg %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {scheduleMetrics.weeklyBreakdown.map((w) => (
                        <tr key={w.week}>
                          <td className="py-3 font-medium text-foreground">{w.period}</td>
                          <td className="py-3 text-center font-semibold text-indigo-600">{w.conducted}</td>
                          <td className="py-3 text-center text-muted-foreground">{w.group}</td>
                          <td className="py-3 text-center text-muted-foreground">{w.indiv}</td>
                          <td className="py-3 text-center text-muted-foreground">{w.intensive}</td>
                          <td className="py-3 text-center font-semibold text-foreground">
                            {w.attended}/{w.enrolled}
                          </td>
                          <td className="py-3 text-right font-bold text-teal-600">{w.avgPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-semibold text-foreground text-base">Class &amp; Kids Distribution per Course</h3>
                <p className="text-xs text-muted-foreground mt-0.5 mb-4">
                  Active classes, total kids, and conducted lessons per course.
                </p>
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-2.5 font-semibold">Course</th>
                        <th className="py-2.5 font-semibold text-center">Classes</th>
                        <th className="py-2.5 font-semibold text-center">Total Kids</th>
                        <th className="py-2.5 font-semibold text-right">Conducted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {scheduleMetrics.courseDistribution.map((c) => (
                        <tr key={c.course}>
                          <td className="py-3 font-medium text-foreground">{c.course}</td>
                          <td className="py-3 text-center text-muted-foreground">{c.classes}</td>
                          <td className="py-3 text-center font-semibold text-foreground">{c.totalKids}</td>
                          <td className="py-3 text-right font-bold text-emerald-600">{c.conducted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'groups' && (
            <div className="bg-card border border-border rounded-2xl p-5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2.5 font-semibold">Group Code</th>
                    <th className="py-2.5 font-semibold">Course</th>
                    <th className="py-2.5 font-semibold">Tutor</th>
                    <th className="py-2.5 font-semibold text-center">Format</th>
                    <th className="py-2.5 font-semibold text-center">Kids</th>
                    <th className="py-2.5 font-semibold text-right">Conducted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {scheduleMetrics.activeClasses.map((cls) => (
                    <tr key={cls.classKey}>
                      <td className="py-2.5 font-medium text-foreground">{cls.groupCode}</td>
                      <td className="py-2.5 text-muted-foreground">{cls.courseName}</td>
                      <td className="py-2.5 text-foreground">{cls.teacher}</td>
                      <td className="py-2.5 text-center">{cls.format}</td>
                      <td className="py-2.5 text-center font-semibold">{cls.kids}</td>
                      <td className="py-2.5 text-right font-semibold text-indigo-600">{cls.conducted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'lesson1' && (
            <div className="bg-card border border-border rounded-2xl p-5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2.5 font-semibold">Date</th>
                    <th className="py-2.5 font-semibold">Group Code</th>
                    <th className="py-2.5 font-semibold">Course</th>
                    <th className="py-2.5 font-semibold">Tutor</th>
                    <th className="py-2.5 font-semibold text-right">Kids</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredSchedules
                    .filter((r) => Number(r.lesson_number) === 1)
                    .map((r) => (
                      <tr key={r.id}>
                        <td className="py-2.5 text-muted-foreground">{r.lesson_date}</td>
                        <td className="py-2.5 font-medium text-foreground">{r.group_code || '-'}</td>
                        <td className="py-2.5 text-muted-foreground">{getCourseLabel(r)}</td>
                        <td className="py-2.5 text-foreground">{r.lesson_teacher}</td>
                        <td className="py-2.5 text-right font-semibold">{parseEnrolledCount(r)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'log' && (
            <div className="bg-card border border-border rounded-2xl p-5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2.5 font-semibold">Date</th>
                    <th className="py-2.5 font-semibold">Group Code</th>
                    <th className="py-2.5 font-semibold">Course</th>
                    <th className="py-2.5 font-semibold">Tutor</th>
                    <th className="py-2.5 font-semibold text-center">Lesson</th>
                    <th className="py-2.5 font-semibold text-right">Attended</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredSchedules.slice(0, 200).map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 text-muted-foreground">{r.lesson_date}</td>
                      <td className="py-2.5 font-medium text-foreground">{r.group_code || '-'}</td>
                      <td className="py-2.5 text-muted-foreground">{getCourseLabel(r)}</td>
                      <td className="py-2.5 text-foreground">{r.lesson_teacher}</td>
                      <td className="py-2.5 text-center">{r.lesson_number ?? '-'}</td>
                      <td className="py-2.5 text-right font-semibold">
                        {r.students_attended ?? 0}/{parseEnrolledCount(r)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* DETAIL CHART DIALOG UNTUK TIAP HERO CARD */}
      <Dialog open={Boolean(chartModal)} onOpenChange={(open) => !open && setChartModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {chartModal === 'conducted' && 'Lessons Conducted — Weekly Breakdown'}
              {chartModal === 'attendance' && 'Student Attendance Ratio — Weekly Breakdown'}
              {chartModal === 'discipline' && 'Discipline Breakdown (75% Monthly Feedback + 25% Meeting Presence)'}
              {chartModal === 'qc' && 'QC Result Average — Period 1 vs Period 2'}
            </DialogTitle>
          </DialogHeader>

          {chartModal === 'conducted' && (
            <div className="h-64 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scheduleMetrics.weeklyBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="conducted" name="Conducted Lessons" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {chartModal === 'attendance' && (
            <div className="h-64 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scheduleMetrics.weeklyBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="avgPct" name="Attendance %" stroke="#0d9488" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {chartModal === 'discipline' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-violet-50 border border-violet-200">
                  <div className="text-violet-700 font-medium">Combined Discipline</div>
                  <div className="text-xl font-bold text-violet-900 mt-0.5">
                    {disciplineMetrics.overallPct !== null ? `${disciplineMetrics.overallPct}%` : '-'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-secondary border border-border">
                  <div className="text-muted-foreground font-medium">Monthly Feedback (75%)</div>
                  <div className="text-xl font-bold text-foreground mt-0.5">
                    {disciplineMetrics.fbPct !== null ? `${disciplineMetrics.fbPct}%` : '-'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {disciplineMetrics.fbDone}/{disciplineMetrics.fbTotal} completed
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-secondary border border-border">
                  <div className="text-muted-foreground font-medium">Meeting Presence (25%)</div>
                  <div className="text-xl font-bold text-foreground mt-0.5">
                    {disciplineMetrics.meetPct !== null ? `${disciplineMetrics.meetPct}%` : '-'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Present: {disciplineMetrics.presentCount} · Excused: {disciplineMetrics.excusedCount}
                  </div>
                </div>
              </div>

              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={disciplineMetrics.weeklyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="feedback" name="Monthly Feedback %" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="meeting" name="Meeting Presence %" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {chartModal === 'qc' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-amber-800 font-medium">Overall QC Avg</div>
                  <div className="text-xl font-bold text-amber-950 mt-0.5">
                    {qcMetrics.overallAvg ?? '-'}
                  </div>
                  <div className="text-[11px] text-amber-700">{qcMetrics.totalCount} total QCs</div>
                </div>
                <div className="p-3 rounded-xl bg-secondary border border-border">
                  <div className="text-muted-foreground font-medium">Period 1 (1–15)</div>
                  <div className="text-xl font-bold text-foreground mt-0.5">
                    {qcMetrics.p1Avg ?? '-'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{qcMetrics.p1Count} evaluations</div>
                </div>
                <div className="p-3 rounded-xl bg-secondary border border-border">
                  <div className="text-muted-foreground font-medium">Period 2 (16–End)</div>
                  <div className="text-xl font-bold text-foreground mt-0.5">
                    {qcMetrics.p2Avg ?? '-'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{qcMetrics.p2Count} evaluations</div>
                </div>
              </div>

              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={qcMetrics.periodTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="QC Average Score" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}