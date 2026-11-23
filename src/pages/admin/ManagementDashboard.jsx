import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarDays, FileSpreadsheet, Loader2, X } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
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

const normalizeName = (name) =>
  (name || '')
    .toLowerCase()
    .replace(/\b(binti|bin|md|mohd|muhammad)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

const isSameTutor = (a, b) => {
  if (!a || !b) return false;
  const cleanA = String(a).toLowerCase().trim();
  const cleanB = String(b).toLowerCase().trim();
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

const isMonthlyFeedbackAssignment = (assignment) => {
  if (!assignment) return false;
  if (String(assignment.status || '').toLowerCase().trim() === 'rescheduled') return false;

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

const getMonthlyFeedbackCompletionRatio = (assignment) => {
  const isDoneFlag =
    assignment.is_done === true ||
    ['completed', 'done', 'submitted'].includes(
      String(assignment.status || '').toLowerCase().trim()
    );

  const totalStudents = Number(assignment.student_count) || 0;
  const completedStudents = Number(assignment.completed_count) || 0;

  if (isDoneFlag) return 1;
  if (totalStudents > 0 && completedStudents > 0) {
    return Math.min(1, completedStudents / totalStudents);
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

const shouldIgnoreZeroEmptyRecord = (record) => {
  if (!record) return false;
  const pct =
    record.attendance_pct !== undefined && record.attendance_pct !== null
      ? parsePercentNumber(record.attendance_pct)
      : 0;
  const compactRaw = String(record.students_raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
  const attended = Number(record.students_attended) || 0;
  return pct === 0 && (compactRaw === '0(0)' || compactRaw === '0' || compactRaw === '') && attended === 0;
};

const parseExpectedStudentsCount = (r) => {
  const rawCount = parseLeadingInt(r.students_raw);
  if (rawCount > 0) return rawCount;
  const direct = Number(r.students_count);
  if (!Number.isNaN(direct) && direct > 0) return direct;
  const attended = Number(r.students_attended) || 0;
  return attended >= 1 ? attended : 0;
};

const isLessonConducted = (r) => {
  const attended = Number(r.students_attended) || 0;
  if (r.is_conducted === true) return attended >= 1;
  if (r.is_conducted === false) return false;
  const pct = parsePercentNumber(r.attendance_pct);
  return pct > 0 && attended >= 1;
};

const getWeekBucket = (dateStr) => {
  if (!dateStr) return 'W1';
  const day = Number(String(dateStr).split('-')[2] || 1);
  if (day <= 7) return 'W1';
  if (day <= 14) return 'W2';
  if (day <= 21) return 'W3';
  return 'W4';
};

const inferCategoryFromText = (rawText) => {
  const txt = String(rawText || '').toLowerCase();
  if (
    txt.includes('design') ||
    txt.includes('graphic') ||
    txt.includes('figma') ||
    txt.includes('ui') ||
    txt.includes('digital art')
  ) {
    return 'Design';
  }
  if (txt.includes('math') || txt.includes('mtk') || txt.includes('bebras')) {
    return 'Math';
  }
  return 'Coding';
};

const resolveTutorCategory = (tutor, fallbackText = '') => {
  let coursesStr = '';
  if (Array.isArray(tutor?.taught_courses)) {
    coursesStr = tutor.taught_courses
      .map((c) => (typeof c === 'string' ? c : c?.name || c?.course_name || JSON.stringify(c)))
      .join(' ');
  } else if (tutor?.taught_courses && typeof tutor.taught_courses === 'object') {
    coursesStr = JSON.stringify(tutor.taught_courses);
  } else if (typeof tutor?.taught_courses === 'string') {
    coursesStr = tutor.taught_courses;
  }

  const combined = `${coursesStr} ${fallbackText}`.trim();
  return inferCategoryFromText(combined);
};

const formatDeltaPt = (currentVal, prevVal, monthLabel) => {
  if (currentVal === null || currentVal === undefined || prevVal === null || prevVal === undefined) {
    return null;
  }
  const diff = Number((Number(currentVal) - Number(prevVal)).toFixed(1));
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)} pt vs ${monthLabel}`;
};

function ManagementDashboard() {
  const [loading, setLoading] = useState(true);
  const [tutors, setTutors] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [feedbackAssignments, setFeedbackAssignments] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [meetingAttendances, setMeetingAttendances] = useState([]);
  const [qcRecords, setQcRecords] = useState([]);

  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [detailModal, setDetailModal] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      let allSchedules = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('BoScheduleRecord')
          .select('*')
          .range(from, from + step - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allSchedules = allSchedules.concat(data.filter((r) => !shouldIgnoreZeroEmptyRecord(r)));
        if (data.length < step) break;
        from += step;
      }

      const [userRes, fbRes, meetRes, attRes, qcRes] = await Promise.all([
        supabase
          .from('CustomUser')
          .select('id, full_name, username, role, taught_courses, is_active, is_sample'),
        supabase.from('WeeklyFeedbackAssignment').select('*'),
        supabase.from('TutorMeeting').select('*'),
        supabase.from('TutorMeetingAttendance').select('*'),
        supabase.from('QCRecord').select('*'),
      ]);

      if (userRes.error) throw userRes.error;
      if (fbRes.error) throw fbRes.error;
      if (meetRes.error) throw meetRes.error;
      if (attRes.error) throw attRes.error;
      if (qcRes.error) throw qcRes.error;

      setTutors(
        (userRes.data || []).filter(
          (u) =>
            u.is_active !== false &&
            !u.is_sample &&
            ['Tutor', 'Team Leader'].includes(u.role)
        )
      );
      setSchedules(allSchedules);
      setFeedbackAssignments((fbRes.data || []).filter((a) => !a.is_sample));
      setMeetings(meetRes.data || []);
      setMeetingAttendances(attRes.data || []);
      setQcRecords((qcRes.data || []).filter((q) => !q.is_sample));
    } catch (err) {
      toast.error('Failed to load Management Dashboard', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const computePeriodSnapshot = (yearVal, monthVal, categoryVal) => {
    const matchMonth = (mNum) => monthVal === 'all' || String(Number(mNum)) === String(monthVal);
    const matchYear = (yNum) => yearVal === 'all' || String(yNum) === String(yearVal);
    const matchDateYM = (dateStr) => {
      if (!dateStr) return true;
      const str = String(dateStr).trim();
      const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})/);
      if (isoMatch) {
        return matchYear(isoMatch[1]) && matchMonth(isoMatch[2]);
      }
      const parsed = new Date(str);
      if (!Number.isNaN(parsed.getTime())) {
        return matchYear(parsed.getFullYear()) && matchMonth(parsed.getMonth() + 1);
      }
      return true;
    };

    const tutorCategoryMap = new Map();
    tutors.forEach((t) => {
      const tName = t.full_name || t.username || '';
      const schedSample = schedules
        .filter((r) => isSameTutor(r.lesson_teacher, tName))
        .slice(0, 5)
        .map((r) => `${r.course || ''} ${r.group_title || ''}`)
        .join(' ');
      tutorCategoryMap.set(t.id, resolveTutorCategory(t, schedSample));
    });

    const getCategoryForRecord = (tutorId, tutorName, textHint) => {
      if (tutorId && tutorCategoryMap.has(tutorId)) return tutorCategoryMap.get(tutorId);
      const matchedTutor = tutors.find((t) => isSameTutor(t.full_name || t.username, tutorName));
      if (matchedTutor && tutorCategoryMap.has(matchedTutor.id)) {
        return tutorCategoryMap.get(matchedTutor.id);
      }
      return inferCategoryFromText(textHint);
    };

    // 1. Schedules (Attendance)
    const periodSchedules = schedules.filter((r) => {
      if (r.is_test_group) return false;
      if (!matchYear(r.lesson_year) || !matchMonth(r.lesson_month)) return false;
      const cat = getCategoryForRecord(
        null,
        r.lesson_teacher,
        `${r.course || ''} ${r.group_title || ''} ${r.lesson_title || ''}`
      );
      if (categoryVal !== 'all' && cat !== categoryVal) return false;
      return true;
    });

    const conductedSchedules = periodSchedules.filter(isLessonConducted);
    const studentsAttended = conductedSchedules.reduce(
      (sum, r) => sum + (Number(r.students_attended) || 0),
      0
    );
    const shouldAttend = conductedSchedules.reduce(
      (sum, r) => sum + parseExpectedStudentsCount(r),
      0
    );
    const overallAttendancePct =
      shouldAttend > 0 ? Number(((studentsAttended / shouldAttend) * 100).toFixed(1)) : 0;

    const weeklyBars = ['W1', 'W2', 'W3', 'W4'].map((wk) => {
      const items = conductedSchedules.filter((r) => getWeekBucket(r.lesson_date) === wk);
      const att = items.reduce((s, r) => s + (Number(r.students_attended) || 0), 0);
      const exp = items.reduce((s, r) => s + parseExpectedStudentsCount(r), 0);
      const hasData = items.length > 0 && exp > 0;
      const pct = hasData ? Number(((att / exp) * 100).toFixed(1)) : null;
      return { week: wk, pct, hasData, attended: att, enrolled: exp };
    });

    // 2. Monthly Meetings
    const periodMeetings = meetings.filter((m) => matchDateYM(m.meeting_date));
    const meetingMap = new Map(periodMeetings.map((m) => [m.id, m]));
    const meetingIds = new Set(periodMeetings.map((m) => m.id));

    // 3. Monthly Feedback (WeeklyFeedbackAssignment - monthly feedback only)
    const periodMonthlyFeedback = feedbackAssignments.filter((a) => {
      if (!isMonthlyFeedbackAssignment(a)) return false;
      if (a.week_start_date) {
        if (!matchDateYM(a.week_start_date)) return false;
      } else if (monthVal !== 'all' && a.month) {
        const mLabel = MONTHS.find((m) => m.value === String(monthVal))?.label.toLowerCase();
        if (
          String(a.month) !== String(monthVal) &&
          !String(a.month).toLowerCase().includes(mLabel || '___')
        ) {
          return false;
        }
      }
      const cat = getCategoryForRecord(
        a.tutor_id,
        a.tutor_name,
        `${a.course_name || ''} ${a.class_name || ''} ${a.notes || ''}`
      );
      if (categoryVal !== 'all' && cat !== categoryVal) return false;
      return true;
    });

    // 4. QC Records (QCRecord: period 1 = P1, period 2 = P2)
    const periodQc = qcRecords.filter((q) => {
      if (q.evaluation_score === null || q.evaluation_score === undefined) return false;
      if (q.period_year !== undefined && q.period_year !== null && !matchYear(q.period_year)) {
        return false;
      }
      if (q.period_month !== undefined && q.period_month !== null && !matchMonth(q.period_month)) {
        return false;
      }
      if (
        (q.period_year === undefined || q.period_year === null) &&
        q.record_date &&
        !matchDateYM(q.record_date)
      ) {
        return false;
      }
      const cat = getCategoryForRecord(q.tutor_id, q.tutor_name, q.notes || '');
      if (categoryVal !== 'all' && cat !== categoryVal) return false;
      return true;
    });

    // 5. Project completion has no database table/records yet
    const projectCompletionPct = null;
    const completedTasksCount = null;
    const dueTasksCount = null;
    const tutorsBelow70Project = null;

    const tutorRoster = tutors.filter((t) => {
      if (categoryVal === 'all') return true;
      return tutorCategoryMap.get(t.id) === categoryVal;
    });

    const scorecards = tutorRoster.map((tutor) => {
      const tName = tutor.full_name || tutor.username || 'Unknown';
      const category = tutorCategoryMap.get(tutor.id) || 'Coding';

      const tSchedules = conductedSchedules.filter((r) => isSameTutor(r.lesson_teacher, tName));
      const tAtt = tSchedules.reduce((s, r) => s + (Number(r.students_attended) || 0), 0);
      const tExp = tSchedules.reduce((s, r) => s + parseExpectedStudentsCount(r), 0);
      const attendancePct = tExp > 0 ? Number(((tAtt / tExp) * 100).toFixed(1)) : null;

      const tMeetAtt = meetingAttendances.filter(
        (att) =>
          meetingIds.has(att.meeting_id) &&
          (att.tutor_id === tutor.id || isSameTutor(att.tutor_name, tName))
      );
      const presentCount = tMeetAtt.filter(
        (r) => normalizeAttendanceStatus(r.status) === 'Present'
      ).length;
      const excusedCount = tMeetAtt.filter(
        (r) => normalizeAttendanceStatus(r.status) === 'Excused'
      ).length;
      const absentCount = tMeetAtt.filter(
        (r) => normalizeAttendanceStatus(r.status) === 'Absent'
      ).length;

      let meetingsPct = null;
      if (tMeetAtt.length > 0) {
        meetingsPct = Number(
          (((presentCount * 1 + excusedCount * 0.75) / tMeetAtt.length) * 100).toFixed(1)
        );
      }

      const tMonthlyFb = periodMonthlyFeedback.filter(
        (a) => (a.tutor_id && a.tutor_id === tutor.id) || isSameTutor(a.tutor_name, tName)
      );
      const fbCompletedCount = tMonthlyFb.filter(
        (item) => getMonthlyFeedbackCompletionRatio(item) >= 1
      ).length;

      let feedbackPct = null;
      if (tMonthlyFb.length > 0) {
        const totalRatio = tMonthlyFb.reduce(
          (sum, item) => sum + getMonthlyFeedbackCompletionRatio(item),
          0
        );
        feedbackPct = Number(((totalRatio / tMonthlyFb.length) * 100).toFixed(1));
      }

      const discParts = [meetingsPct, feedbackPct].filter((v) => v !== null);
      const disciplinePct =
        discParts.length > 0
          ? Number((discParts.reduce((a, b) => a + b, 0) / discParts.length).toFixed(1))
          : null;

      const tQc = periodQc.filter(
        (q) => (q.tutor_id && q.tutor_id === tutor.id) || isSameTutor(q.tutor_name, tName)
      );
      const p1Items = tQc.filter((q) => Number(q.period) === 1);
      const p2Items = tQc.filter((q) => Number(q.period) === 2);

      const avgScore = (arr) =>
        arr.length > 0
          ? Number(
              (arr.reduce((s, x) => s + Number(x.evaluation_score || 0), 0) / arr.length).toFixed(1)
            )
          : null;

      const qcScore = avgScore(tQc);
      const p1Score = avgScore(p1Items);
      const p2Score = avgScore(p2Items);

      const tutorProjectCompletionPct = null;
      const qcProjectScore = qcScore;
      const overallScore =
        disciplinePct !== null && qcProjectScore !== null
          ? Number(((disciplinePct + qcProjectScore) / 2).toFixed(1))
          : disciplinePct ?? qcProjectScore ?? null;

      let tier = 'no_classes';
      if (tSchedules.length === 0 && overallScore === null) {
        tier = 'no_classes';
      } else if ((overallScore ?? 0) >= 90) {
        tier = 'high';
      } else if ((overallScore ?? 0) >= 80) {
        tier = 'stable';
      } else if ((overallScore ?? 0) >= 70) {
        tier = 'need_improvement';
      } else {
        tier = 'low';
      }

      return {
        id: tutor.id,
        tutor: tName,
        category,
        attendancePct,
        conductedLessonsCount: tSchedules.length,
        studentsAttendedCount: tAtt,
        expectedStudentsCount: tExp,
        scheduleItems: tSchedules,
        meetingsPct,
        presentCount,
        excusedCount,
        absentCount,
        meetingItems: tMeetAtt.map((att) => ({
          ...att,
          topic: meetingMap.get(att.meeting_id)?.topic || 'Tutor Meeting',
          meeting_date: meetingMap.get(att.meeting_id)?.meeting_date || '-',
        })),
        feedbackPct,
        fbCompletedCount,
        fbTotalCount: tMonthlyFb.length,
        feedbackItems: tMonthlyFb,
        disciplinePct,
        qcScore,
        p1Score,
        p2Score,
        qcItems: tQc,
        projectCompletionPct: tutorProjectCompletionPct,
        qcProjectScore,
        overallScore,
        tier,
      };
    });

    const activeScorecards = scorecards.filter((s) => s.tier !== 'no_classes');
    const tutorsBelow70Attendance = activeScorecards.filter(
      (s) => s.attendancePct !== null && s.attendancePct < 70
    ).length;

    const meetingScorecards = scorecards.filter((s) => s.meetingsPct !== null);
    const monthlyMeetingsPct =
      meetingScorecards.length > 0
        ? Number(
            (
              meetingScorecards.reduce((a, b) => a + b.meetingsPct, 0) / meetingScorecards.length
            ).toFixed(1)
          )
        : null;
    const tutorsAttendedMeeting = meetingScorecards.filter((s) => s.meetingsPct > 0).length;
    const totalMeetingRoster = meetingScorecards.length;

    const feedbackScorecards = scorecards.filter((s) => s.feedbackPct !== null);
    const monthlyFeedbackPct =
      periodMonthlyFeedback.length > 0
        ? Number(
            (
              (periodMonthlyFeedback.reduce(
                (sum, item) => sum + getMonthlyFeedbackCompletionRatio(item),
                0
              ) /
                periodMonthlyFeedback.length) *
              100
            ).toFixed(1)
          )
        : null;
    const tutorsBelow70Feedback = feedbackScorecards.filter((s) => s.feedbackPct < 70).length;

    const discValues = [monthlyMeetingsPct, monthlyFeedbackPct].filter((v) => v !== null);
    const disciplinePct =
      discValues.length > 0
        ? Number((discValues.reduce((a, b) => a + b, 0) / discValues.length).toFixed(1))
        : null;
    const tutorsBelow70Discipline = activeScorecards.filter(
      (s) => s.disciplinePct !== null && s.disciplinePct < 70
    ).length;

    const qcAvg =
      periodQc.length > 0
        ? Number(
            (
              periodQc.reduce((s, q) => s + Number(q.evaluation_score || 0), 0) / periodQc.length
            ).toFixed(1)
          )
        : null;

    const p1All = periodQc.filter((q) => Number(q.period) === 1);
    const p2All = periodQc.filter((q) => Number(q.period) === 2);

    const p1Avg =
      p1All.length > 0
        ? Number(
            (p1All.reduce((s, q) => s + Number(q.evaluation_score || 0), 0) / p1All.length).toFixed(
              1
            )
          )
        : null;
    const p2Avg =
      p2All.length > 0
        ? Number(
            (p2All.reduce((s, q) => s + Number(q.evaluation_score || 0), 0) / p2All.length).toFixed(
              1
            )
          )
        : 'Not scored';

    const tutorsWithNoQc = activeScorecards.filter((s) => s.qcScore === null).length;
    const qcPlusProjectScore = qcAvg;
    const tutorsBelow70QcProj = activeScorecards.filter(
      (s) => s.qcProjectScore !== null && s.qcProjectScore < 70
    ).length;

    const sortedScorecards = scorecards.sort((a, b) => {
      if (a.overallScore === null && b.overallScore === null) return a.tutor.localeCompare(b.tutor);
      if (a.overallScore === null) return 1;
      if (b.overallScore === null) return -1;
      return b.overallScore - a.overallScore;
    });

    const tierCounts = {
      high: scorecards.filter((s) => s.tier === 'high').length,
      stable: scorecards.filter((s) => s.tier === 'stable').length,
      need_improvement: scorecards.filter((s) => s.tier === 'need_improvement').length,
      low: scorecards.filter((s) => s.tier === 'low').length,
      no_classes: scorecards.filter((s) => s.tier === 'no_classes').length,
    };

    return {
      overallAttendancePct,
      studentsAttended,
      shouldAttend,
      tutorsBelow70Attendance,
      weeklyBars,
      disciplinePct,
      monthlyMeetingsPct,
      tutorsAttendedMeeting,
      totalMeetingRoster,
      monthlyFeedbackPct,
      tutorsBelow70Feedback,
      tutorsBelow70Discipline,
      qcAvg,
      p1Avg,
      p2Avg,
      tutorsWithNoQc,
      projectCompletionPct,
      completedTasksCount,
      dueTasksCount,
      tutorsBelow70Project,
      qcPlusProjectScore,
      tutorsBelow70QcProj,
      scorecards: sortedScorecards,
      tierCounts,
    };
  };

  const currentSnapshot = useMemo(
    () => computePeriodSnapshot(selectedYear, selectedMonth, selectedCategory),
    [
      tutors,
      schedules,
      feedbackAssignments,
      meetings,
      meetingAttendances,
      qcRecords,
      selectedYear,
      selectedMonth,
      selectedCategory,
    ]
  );

  const prevMonthInfo = useMemo(() => {
    if (selectedMonth === 'all') return null;
    let m = Number(selectedMonth) - 1;
    let y = Number(selectedYear) || 2026;
    if (m <= 0) {
      m = 12;
      y -= 1;
    }
    const shortLabel =
      MONTHS.find((item) => Number(item.value) === m)?.label.slice(0, 3) || 'Prev';
    return { month: String(m), year: String(y), shortLabel };
  }, [selectedMonth, selectedYear]);

  const prevSnapshot = useMemo(() => {
    if (!prevMonthInfo) return null;
    return computePeriodSnapshot(prevMonthInfo.year, prevMonthInfo.month, selectedCategory);
  }, [
    prevMonthInfo,
    tutors,
    schedules,
    feedbackAssignments,
    meetings,
    meetingAttendances,
    qcRecords,
    selectedCategory,
  ]);

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const rows = currentSnapshot.scorecards.map((s) => ({
        Tutor: s.tutor,
        Category: s.category,
        Attendance: s.attendancePct !== null ? `${s.attendancePct}%` : '-',
        Meetings: s.meetingsPct !== null ? `${s.meetingsPct}%` : '-',
        Feedback: s.feedbackPct !== null ? `${s.feedbackPct}%` : '-',
        Discipline: s.disciplinePct !== null ? `${s.disciplinePct}%` : '-',
        QC: s.qcScore ?? '-',
        'Project completion': s.projectCompletionPct !== null ? `${s.projectCompletionPct}%` : '-',
        'QC + Project': s.qcProjectScore ?? '-',
        Overall: s.overallScore ?? '-',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Tutor Scorecard');
      const mLabel =
        selectedMonth === 'all'
          ? 'AllMonths'
          : MONTHS.find((m) => m.value === selectedMonth)?.label || selectedMonth;
      XLSX.writeFile(wb, `Management_Dashboard_${mLabel}_${selectedYear}.xlsx`);
      toast.success('Management Dashboard exported to Excel');
    } catch (err) {
      toast.error('Export failed', { description: err.message });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  const monthTitle =
    selectedMonth === 'all'
      ? 'All Months'
      : MONTHS.find((m) => m.value === selectedMonth)?.label || 'November';

  const attDelta = formatDeltaPt(
    currentSnapshot.overallAttendancePct,
    prevSnapshot?.overallAttendancePct ?? null,
    prevMonthInfo?.shortLabel || 'Prev'
  );
  const discDelta = formatDeltaPt(
    currentSnapshot.disciplinePct,
    prevSnapshot?.disciplinePct ?? null,
    prevMonthInfo?.shortLabel || 'Prev'
  );
  const qcProjDelta = formatDeltaPt(
    currentSnapshot.qcPlusProjectScore,
    prevSnapshot?.qcPlusProjectScore ?? null,
    prevMonthInfo?.shortLabel || 'Prev'
  );
  const qcDelta = formatDeltaPt(
    currentSnapshot.qcAvg,
    prevSnapshot?.qcAvg ?? null,
    prevMonthInfo?.shortLabel || 'Prev'
  );
  const projDelta = formatDeltaPt(
    currentSnapshot.projectCompletionPct,
    prevSnapshot?.projectCompletionPct ?? null,
    prevMonthInfo?.shortLabel || 'Prev'
  );

  const renderModalContent = () => {
    if (!detailModal) return null;
    const { row, metricKey } = detailModal;

    if (metricKey === 'attendance') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-center">
              <div className="text-[11px] text-muted-foreground">Attendance Ratio</div>
              <div className="text-2xl font-bold text-primary mt-1">
                {row.attendancePct !== null ? `${row.attendancePct}%` : '-'}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
              <div className="text-[11px] text-muted-foreground">Conducted Lessons</div>
              <div className="text-2xl font-bold text-primary mt-1">
                {row.conductedLessonsCount}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
              <div className="text-[11px] text-muted-foreground">Total Students</div>
              <div className="text-2xl font-bold text-foreground mt-1">
                {row.studentsAttendedCount}/{row.expectedStudentsCount}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">kids attended</div>
            </div>
          </div>
          {row.scheduleItems.length > 0 && (
            <div className="max-h-52 overflow-y-auto rounded-xl border border-border divide-y divide-border text-xs">
              {row.scheduleItems.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <div className="font-medium text-foreground">
                      {item.group_title || item.course || 'Class Session'}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {item.lesson_date || '-'} • {item.lesson_title || item.course || '-'}
                    </div>
                  </div>
                  <div className="font-semibold text-foreground">
                    {item.students_attended ?? 0}/{parseExpectedStudentsCount(item)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (metricKey === 'meetings') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
              <div className="text-[11px] text-muted-foreground">Meetings Score</div>
              <div className="text-2xl font-bold text-foreground mt-1">
                {row.meetingsPct !== null ? `${row.meetingsPct}%` : '-'}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
              <div className="text-[11px] text-muted-foreground">Present / Excused</div>
              <div className="text-2xl font-bold text-primary mt-1">
                {row.presentCount} / {row.excusedCount}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
              <div className="text-[11px] text-muted-foreground">Absent / Total</div>
              <div className="text-2xl font-bold text-foreground mt-1">
                {row.absentCount} / {row.meetingItems.length}
              </div>
            </div>
          </div>
          {row.meetingItems.length > 0 ? (
            <div className="max-h-52 overflow-y-auto rounded-xl border border-border divide-y divide-border text-xs">
              {row.meetingItems.map((m, idx) => (
                <div key={m.id || idx} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <div className="font-medium text-foreground">{m.topic}</div>
                    <div className="text-[11px] text-muted-foreground">{m.meeting_date}</div>
                  </div>
                  <span className="font-semibold text-foreground">
                    {normalizeAttendanceStatus(m.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              No meeting attendance records for this period.
            </p>
          )}
        </div>
      );
    }

    if (metricKey === 'feedback') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
              <div className="text-[11px] text-muted-foreground">Monthly Feedback</div>
              <div className="text-2xl font-bold text-foreground mt-1">
                {row.feedbackPct !== null ? `${row.feedbackPct}%` : '-'}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
              <div className="text-[11px] text-muted-foreground">Completed</div>
              <div className="text-2xl font-bold text-primary mt-1">{row.fbCompletedCount}</div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
              <div className="text-[11px] text-muted-foreground">Total Assignments</div>
              <div className="text-2xl font-bold text-foreground mt-1">{row.fbTotalCount}</div>
            </div>
          </div>
          {row.feedbackItems.length > 0 ? (
            <div className="max-h-52 overflow-y-auto rounded-xl border border-border divide-y divide-border text-xs">
              {row.feedbackItems.map((fb, idx) => {
                const done = getMonthlyFeedbackCompletionRatio(fb) >= 1;
                return (
                  <div key={fb.id || idx} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <div className="font-medium text-foreground">
                        {fb.class_name || fb.student_name || fb.course_name || 'Monthly Feedback'}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {fb.course_name || '-'} • Lesson {fb.lesson_number || '-'}
                      </div>
                    </div>
                    <span
                      className={`font-semibold ${
                        done ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {done ? 'Completed' : fb.status || 'Pending'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              No monthly feedback assignments for this period.
            </p>
          )}
        </div>
      );
    }

    if (metricKey === 'discipline') {
      return (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
            <div className="text-[11px] text-muted-foreground">Discipline</div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {row.disciplinePct !== null ? `${row.disciplinePct}%` : '-'}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
            <div className="text-[11px] text-muted-foreground">Meetings (50%)</div>
            <div className="text-2xl font-bold text-primary mt-1">
              {row.meetingsPct !== null ? `${row.meetingsPct}%` : '-'}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
            <div className="text-[11px] text-muted-foreground">Feedback (50%)</div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {row.feedbackPct !== null ? `${row.feedbackPct}%` : '-'}
            </div>
          </div>
        </div>
      );
    }

    if (metricKey === 'qc') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
              <div className="text-[11px] text-muted-foreground">QC Average</div>
              <div className="text-2xl font-bold text-foreground mt-1">
                {row.qcScore !== null ? row.qcScore : '-'}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
              <div className="text-[11px] text-muted-foreground">P1 Score</div>
              <div className="text-2xl font-bold text-primary mt-1">
                {row.p1Score !== null ? row.p1Score : '-'}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
              <div className="text-[11px] text-muted-foreground">P2 Score</div>
              <div className="text-2xl font-bold text-foreground mt-1">
                {row.p2Score !== null ? row.p2Score : '-'}
              </div>
            </div>
          </div>
          {row.qcItems.length > 0 ? (
            <div className="max-h-52 overflow-y-auto rounded-xl border border-border divide-y divide-border text-xs">
              {row.qcItems.map((q, idx) => (
                <div key={q.id || idx} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <div className="font-medium text-foreground">
                      Period {q.period || '-'} • {q.record_date || '-'}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {q.notes || q.auto_generated_notes || 'QC Evaluation'}
                    </div>
                  </div>
                  <span className="font-bold text-foreground">{q.evaluation_score}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              No QC evaluations recorded for this period.
            </p>
          )}
        </div>
      );
    }

    if (metricKey === 'project') {
      return (
        <div className="rounded-xl border border-border bg-secondary/40 p-4 text-center space-y-1">
          <div className="text-sm font-semibold text-foreground">Project completion</div>
          <p className="text-xs text-muted-foreground">
            No project completion data is available yet for {row.tutor}.
          </p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
          <div className="text-[11px] text-muted-foreground">Discipline</div>
          <div className="text-2xl font-bold text-foreground mt-1">
            {row.disciplinePct !== null ? `${row.disciplinePct}%` : '-'}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
          <div className="text-[11px] text-muted-foreground">QC + Project</div>
          <div className="text-2xl font-bold text-primary mt-1">
            {row.qcProjectScore !== null ? row.qcProjectScore : '-'}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-center">
          <div className="text-[11px] text-muted-foreground">Overall</div>
          <div className="text-2xl font-bold text-foreground mt-1">
            {row.overallScore !== null ? row.overallScore : '-'}
          </div>
        </div>
      </div>
    );
  };

  const modalTitleMap = {
    attendance: 'Attendance Detail',
    meetings: 'Meetings Detail',
    feedback: 'Monthly Feedback Detail',
    discipline: 'Discipline Detail',
    qc: 'QC Evaluation Detail',
    project: 'Project Completion Detail',
    qcProject: 'QC + Project Detail',
    overall: 'Overall Score Detail',
  };

  const below70Class = (val) => {
    if (val === null || val === undefined) return 'text-muted-foreground';
    return Number(val) < 70 ? 'text-rose-600 font-semibold' : 'text-foreground';
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Top Header & Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Tutor performance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Management Dashboard • {monthTitle} {selectedYear === 'all' ? 'All Years' : selectedYear}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Year</span>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-28 bg-card border-border h-9 text-xs font-medium">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Month</span>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-36 bg-card border-border h-9 text-xs font-medium">
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
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Tutor category</span>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-36 bg-card border-border h-9 text-xs font-medium">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="Coding">Coding</SelectItem>
                <SelectItem value="Design">Design</SelectItem>
                <SelectItem value="Math">Math</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-transparent select-none">Export</span>
            <Button
              type="button"
              variant="outline"
              onClick={handleExportExcel}
              className="h-9 bg-card border-border text-foreground hover:bg-secondary text-xs font-semibold gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground" />
              Export Excel
            </Button>
          </div>
        </div>
      </div>

      {/* Row 1: Attendance (Left) & Discipline (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Attendance Card */}
        <div className="lg:col-span-7 bg-card border border-border rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-5">
          <div>
            <div className="text-xs font-semibold text-muted-foreground">Attendance</div>
            <div className="flex items-baseline gap-2.5 mt-1">
              <span className="text-4xl font-bold text-foreground tracking-tight">
                {currentSnapshot.overallAttendancePct}%
              </span>
              {attDelta && (
                <span className="text-xs font-semibold text-emerald-600">{attDelta}</span>
              )}
            </div>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={currentSnapshot.weeklyBars.map((b) => ({
                  ...b,
                  chartVal: b.hasData ? b.pct : 0,
                }))}
                margin={{ top: 22, right: 12, left: -18, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="2 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="week"
                  axisLine={false}
                  tickLine={false}
                  tick={({ x, y, payload }) => {
                    const item = currentSnapshot.weeklyBars.find((w) => w.week === payload.value);
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text x={0} y={14} textAnchor="middle" fill="#64748b" fontSize={11} fontWeight={500}>
                          {payload.value}
                        </text>
                        {!item?.hasData && (
                          <text x={0} y={28} textAnchor="middle" fill="#94a3b8" fontSize={10}>
                            No data yet
                          </text>
                        )}
                      </g>
                    );
                  }}
                  height={34}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(v) => `${v}%`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--secondary))' }}
                  formatter={(_val, _name, props) =>
                    props?.payload?.hasData
                      ? [`${props.payload.pct}%`, 'Attendance']
                      : ['No data yet', 'Attendance']
                  }
                />
                <Bar dataKey="chartVal" radius={[4, 4, 0, 0]} maxBarSize={64}>
                  {currentSnapshot.weeklyBars.map((entry) => (
                    <Cell
                      key={entry.week}
                      fill={entry.hasData ? 'hsl(var(--primary))' : 'transparent'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-border">
            <div>
              <div className="text-[11px] text-muted-foreground">Students attended</div>
              <div className="text-lg font-bold text-foreground mt-0.5">
                {currentSnapshot.studentsAttended.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Should attend</div>
              <div className="text-lg font-bold text-foreground mt-0.5">
                {currentSnapshot.shouldAttend.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Tutors below 70%</div>
              <div className="text-lg font-bold text-foreground mt-0.5">
                {currentSnapshot.tutorsBelow70Attendance}
              </div>
            </div>
          </div>
        </div>

        {/* Discipline Card */}
        <div className="lg:col-span-5 bg-card border border-border rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground">Discipline</div>
            <div className="flex items-baseline gap-2.5 mt-1">
              <span className="text-4xl font-bold text-foreground tracking-tight">
                {currentSnapshot.disciplinePct !== null ? `${currentSnapshot.disciplinePct}%` : '-'}
              </span>
              {discDelta && (
                <span className="text-xs font-semibold text-emerald-600">{discDelta}</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary/50 border border-border rounded-xl p-3.5 flex flex-col justify-between min-h-36">
              <div>
                <div className="text-xs font-semibold text-foreground">Monthly meetings</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Weight 50%</div>
                <div className="text-2xl font-bold text-foreground mt-2">
                  {currentSnapshot.monthlyMeetingsPct !== null
                    ? `${currentSnapshot.monthlyMeetingsPct}%`
                    : '-'}
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-border text-[11px]">
                <span className="text-muted-foreground">Tutors attended</span>
                <span className="font-bold text-foreground text-right leading-tight">
                  {currentSnapshot.tutorsAttendedMeeting} of {currentSnapshot.totalMeetingRoster}
                </span>
              </div>
            </div>

            <div className="bg-secondary/50 border border-border rounded-xl p-3.5 flex flex-col justify-between min-h-36">
              <div>
                <div className="text-xs font-semibold text-foreground">Monthly feedback</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Weight 50%</div>
                <div className="text-2xl font-bold text-foreground mt-2">
                  {currentSnapshot.monthlyFeedbackPct !== null
                    ? `${currentSnapshot.monthlyFeedbackPct}%`
                    : '-'}
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-border text-[11px]">
                <span className="text-muted-foreground">Tutors below 70%</span>
                <span className="font-bold text-foreground">
                  {currentSnapshot.tutorsBelow70Feedback}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
            <span className="text-muted-foreground">Tutors below 70% discipline</span>
            <span className="font-bold text-foreground">
              {currentSnapshot.tutorsBelow70Discipline}
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: QC + Project Completion */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
        <div>
          <div className="text-xs font-semibold text-muted-foreground">QC + Project completion</div>
          <div className="flex items-baseline gap-2.5 mt-1">
            <span className="text-4xl font-bold text-foreground tracking-tight">
              {currentSnapshot.qcPlusProjectScore !== null
                ? currentSnapshot.qcPlusProjectScore
                : '-'}
            </span>
            <span className="text-sm font-medium text-muted-foreground">/ 100</span>
            {qcProjDelta && (
              <span className="text-xs font-semibold text-emerald-600">{qcProjDelta}</span>
            )}
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden mt-3">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{
                width: `${Math.max(0, Math.min(100, currentSnapshot.qcPlusProjectScore ?? 0))}%`,
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* QC Sub-card */}
          <div className="bg-secondary/50 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">QC</span>
              <span className="text-[11px] text-muted-foreground">Weight 50%</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                {currentSnapshot.qcAvg !== null ? currentSnapshot.qcAvg : '-'}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
              {qcDelta && (
                <span className="text-xs font-semibold text-emerald-600">{qcDelta}</span>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-border text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">P1 average</span>
                <span className="font-semibold text-foreground">
                  {currentSnapshot.p1Avg !== null ? currentSnapshot.p1Avg : 'Not scored'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">P2 average</span>
                <span className="font-semibold text-muted-foreground">{currentSnapshot.p2Avg}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tutors with no QC</span>
                <span className="font-bold text-foreground">{currentSnapshot.tutorsWithNoQc}</span>
              </div>
            </div>
          </div>

          {/* Project Completion Sub-card */}
          <div className="bg-secondary/50 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Project completion</span>
              <span className="text-[11px] text-muted-foreground">Weight 50%</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                {currentSnapshot.projectCompletionPct !== null
                  ? `${currentSnapshot.projectCompletionPct}%`
                  : '-'}
              </span>
              {projDelta && (
                <span className="text-xs font-semibold text-emerald-600">{projDelta}</span>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-border text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Completed</span>
                <span className="font-bold text-foreground">
                  {currentSnapshot.completedTasksCount ?? '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Due</span>
                <span className="font-bold text-foreground">
                  {currentSnapshot.dueTasksCount ?? '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tutors below 70%</span>
                <span className="font-bold text-foreground">
                  {currentSnapshot.tutorsBelow70Project ?? '-'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
          <span className="text-muted-foreground">Tutors below 70</span>
          <span className="font-bold text-foreground">{currentSnapshot.tutorsBelow70QcProj}</span>
        </div>
      </div>

      {/* Row 3: Tutor Scorecard */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Tutor scorecard</h2>
            <p className="text-xs text-rose-500 mt-0.5">
              Red = below 70 • Click any metric cell for detail
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {currentSnapshot.tierCounts.high} high
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              {currentSnapshot.tierCounts.stable} stable
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/70">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {currentSnapshot.tierCounts.need_improvement} need improvement
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/70">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              {currentSnapshot.tierCounts.low} low
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary text-muted-foreground border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              {currentSnapshot.tierCounts.no_classes} no classes
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold">
                <th colSpan={2} className="py-2 text-left text-muted-foreground"></th>
                <th
                  colSpan={4}
                  className="py-2 px-2 text-center text-primary border-b border-primary/30"
                >
                  Discipline, 50/50
                </th>
                <th
                  colSpan={3}
                  className="py-2 px-2 text-center text-muted-foreground border-b border-border"
                >
                  QC + Project, 50/50
                </th>
                <th className="py-2 text-right text-muted-foreground"></th>
              </tr>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="py-2.5 pr-3 text-left">Tutor</th>
                <th className="py-2.5 px-2 text-left">Category</th>
                <th className="py-2.5 px-2 text-right text-primary">Attendance</th>
                <th className="py-2.5 px-2 text-right">Meetings</th>
                <th className="py-2.5 px-2 text-right">Feedback</th>
                <th className="py-2.5 px-2 text-right">Discipline</th>
                <th className="py-2.5 px-2 text-right">QC</th>
                <th className="py-2.5 px-2 text-right">Project completion</th>
                <th className="py-2.5 px-2 text-right">QC + Project</th>
                <th className="py-2.5 pl-2 text-right">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {currentSnapshot.scorecards.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
                    No tutor scorecard data for this filter.
                  </td>
                </tr>
              ) : (
                currentSnapshot.scorecards.map((row) => (
                  <tr key={row.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="py-3 pr-3 font-medium text-foreground whitespace-nowrap">
                      {row.tutor}
                    </td>
                    <td className="py-3 px-2 text-muted-foreground whitespace-nowrap">
                      {row.category}
                    </td>
                    <td className="py-3 px-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ row, metricKey: 'attendance' })}
                        className={`cursor-pointer rounded px-1.5 py-0.5 hover:bg-primary/10 transition-colors font-semibold ${
                          row.attendancePct !== null && Number(row.attendancePct) < 70
                            ? 'text-rose-600'
                            : 'text-primary'
                        }`}
                      >
                        {row.attendancePct !== null ? `${row.attendancePct}%` : '-'}
                      </button>
                    </td>
                    <td className="py-3 px-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ row, metricKey: 'meetings' })}
                        className={`cursor-pointer rounded px-1.5 py-0.5 hover:bg-secondary transition-colors ${below70Class(
                          row.meetingsPct
                        )}`}
                      >
                        {row.meetingsPct !== null ? `${row.meetingsPct}%` : '-'}
                      </button>
                    </td>
                    <td className="py-3 px-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ row, metricKey: 'feedback' })}
                        className={`cursor-pointer rounded px-1.5 py-0.5 hover:bg-secondary transition-colors ${below70Class(
                          row.feedbackPct
                        )}`}
                      >
                        {row.feedbackPct !== null ? `${row.feedbackPct}%` : '-'}
                      </button>
                    </td>
                    <td className="py-3 px-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ row, metricKey: 'discipline' })}
                        className={`cursor-pointer rounded px-1.5 py-0.5 hover:bg-secondary transition-colors font-medium ${below70Class(
                          row.disciplinePct
                        )}`}
                      >
                        {row.disciplinePct !== null ? `${row.disciplinePct}%` : '-'}
                      </button>
                    </td>
                    <td className="py-3 px-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ row, metricKey: 'qc' })}
                        className={`cursor-pointer rounded px-1.5 py-0.5 hover:bg-secondary transition-colors ${below70Class(
                          row.qcScore
                        )}`}
                      >
                        {row.qcScore !== null ? row.qcScore : '-'}
                      </button>
                    </td>
                    <td className="py-3 px-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ row, metricKey: 'project' })}
                        className={`cursor-pointer rounded px-1.5 py-0.5 hover:bg-secondary transition-colors ${below70Class(
                          row.projectCompletionPct
                        )}`}
                      >
                        {row.projectCompletionPct !== null ? `${row.projectCompletionPct}%` : '-'}
                      </button>
                    </td>
                    <td className="py-3 px-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ row, metricKey: 'qcProject' })}
                        className={`cursor-pointer rounded px-1.5 py-0.5 hover:bg-secondary transition-colors ${below70Class(
                          row.qcProjectScore
                        )}`}
                      >
                        {row.qcProjectScore !== null ? row.qcProjectScore : '-'}
                      </button>
                    </td>
                    <td className="py-3 pl-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ row, metricKey: 'overall' })}
                        className={`cursor-pointer rounded px-1.5 py-0.5 hover:bg-secondary transition-colors font-bold ${
                          row.overallScore === null
                            ? 'text-muted-foreground'
                            : Number(row.overallScore) < 70
                            ? 'text-rose-600'
                            : 'text-foreground'
                        }`}
                      >
                        {row.overallScore !== null ? row.overallScore : '-'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-Down Detail Modal */}
      {detailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetailModal(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <CalendarDays className="w-4 h-4 text-primary" />
                <span>
                  {detailModal.row.tutor} — {modalTitleMap[detailModal.metricKey]}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Close detail modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {renderModalContent()}
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagementDashboard;