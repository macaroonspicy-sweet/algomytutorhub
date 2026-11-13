import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAppAuth } from '@/lib/AppAuthContext';
import {
  parseBoScheduleFile,
  getNextMondayISO,
  getWeekBoundsFromDate,
} from '@/lib/boCsvParser';
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
import Pagination from '@/components/ui/pagination';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  Users,
  BookOpen,
  CalendarCheck,
  Sparkles,
  Percent,
  Bell,
  Search,
  CheckCircle2,
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

const WEEKS = [
  'Week 1 (1–7)',
  'Week 2 (8–14)',
  'Week 3 (15–21)',
  'Week 4 (22–End)',
];

const ITEMS_PER_PAGE = 15;

const makeId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function KpiCard({ label, value, sub, icon: Icon, tone }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3.5">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-foreground leading-tight">{value}</div>
        <div className="text-xs font-medium text-foreground/80 truncate">{label}</div>
        {sub && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function TutorAdmin() {
  const { currentUser } = useAppAuth();
  const [records, setRecords] = useState([]);
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedWeek, setSelectedWeek] = useState('all');
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [selectedTutor, setSelectedTutor] = useState('all');
  const [search, setSearch] = useState('');
  const [includeTest, setIncludeTest] = useState(false);

  const [activeTab, setActiveTab] = useState('overview');
  const [page, setPage] = useState(1);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [cutoffDate, setCutoffDate] = useState(() => getNextMondayISO());
  const [importing, setImporting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch all records in batches of 1,000 rows to bypass Supabase default row limits
      let allRecords = [];
      let from = 0;
      const step = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('BoScheduleRecord')
          .select('*')
          .order('lesson_date', { ascending: false })
          .order('unique_key', { ascending: true })
          .range(from, from + step - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allRecords = allRecords.concat(data);
        if (data.length < step) break;
        from += step;
      }

      const { data: userData } = await supabase
        .from('CustomUser')
        .select('id, full_name, role, is_active')
        .in('role', ['Tutor', 'Team Leader']);

      setRecords(allRecords);
      setTutors((userData || []).filter((u) => u.is_active !== false));
    } catch (err) {
      toast.error('Failed to load Tutor Administration data', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const courseOptions = useMemo(() => {
    const set = new Set(records.map((r) => r.course).filter(Boolean));
    return Array.from(set).sort();
  }, [records]);

  const teacherOptions = useMemo(() => {
    const set = new Set(records.map((r) => r.lesson_teacher).filter(Boolean));
    return Array.from(set).sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (!includeTest && r.is_test_group) return false;
      if (selectedYear !== 'all' && String(r.lesson_year) !== selectedYear) return false;
      if (selectedMonth !== 'all' && String(r.lesson_month) !== selectedMonth) return false;
      if (selectedWeek !== 'all' && r.week_label !== selectedWeek) return false;
      if (selectedCourse !== 'all' && r.course !== selectedCourse) return false;
      if (selectedTutor !== 'all' && r.lesson_teacher !== selectedTutor) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${r.group_title || ''} ${r.group_id || ''} ${r.lesson_teacher || ''} ${r.course || ''} ${r.lesson_title || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    records,
    includeTest,
    selectedYear,
    selectedMonth,
    selectedWeek,
    selectedCourse,
    selectedTutor,
    search,
  ]);

  useEffect(() => {
    setPage(1);
  }, [selectedMonth, selectedYear, selectedWeek, selectedCourse, selectedTutor, search, includeTest, activeTab]);

  const conductedRecords = useMemo(
    () => filteredRecords.filter((r) => r.is_conducted),
    [filteredRecords]
  );

  const avgAttendance = useMemo(() => {
    if (!conductedRecords.length) return 0;
    const sum = conductedRecords.reduce((acc, r) => acc + (r.attendance_pct || 0), 0);
    return Math.round(sum / conductedRecords.length);
  }, [conductedRecords]);

  const groupClasses = useMemo(() => {
    const map = new Map();
    for (const r of filteredRecords) {
      if (!includeTest && r.is_test_group) continue;
      const key = r.group_id || r.group_title;
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, {
          group_id: r.group_id || '-',
          group_title: r.group_title || '-',
          group_type: r.group_type || '-',
          course: r.course || '-',
          teacher: r.lesson_teacher || 'Unassigned',
          format: r.format || '-',
          kids_count: Math.max(r.students_count || 0, r.students_attended || 0),
          total_scheduled: 0,
          conducted_count: 0,
          latest_lesson: r.lesson_number || 0,
          latest_date: r.lesson_date || '',
          att_sum: 0,
        });
      }

      const item = map.get(key);
      item.total_scheduled += 1;
      item.kids_count = Math.max(item.kids_count, r.students_count || 0, r.students_attended || 0);
      if (r.lesson_teacher && item.teacher === 'Unassigned') {
        item.teacher = r.lesson_teacher;
      }
      if (r.is_conducted) {
        item.conducted_count += 1;
        item.att_sum += r.attendance_pct || 0;
      }
      if ((r.lesson_date || '') >= item.latest_date) {
        item.latest_date = r.lesson_date || '';
        item.latest_lesson = Math.max(item.latest_lesson, r.lesson_number || 0);
      }
    }

    return Array.from(map.values())
      .map((c) => ({
        ...c,
        avg_attendance: c.conducted_count ? Math.round(c.att_sum / c.conducted_count) : 0,
      }))
      .sort((a, b) => a.group_title.localeCompare(b.group_title));
  }, [filteredRecords, includeTest]);

  const totalKids = useMemo(
    () => groupClasses.reduce((sum, c) => sum + c.kids_count, 0),
    [groupClasses]
  );

  const weeklySummary = useMemo(() => {
    return WEEKS.map((wk) => {
      const rows = filteredRecords.filter((r) => r.week_label === wk);
      const cond = rows.filter((r) => r.is_conducted);
      const groupCount = cond.filter((r) => r.group_type?.toLowerCase() === 'group').length;
      const indivCount = cond.filter((r) => r.group_type?.toLowerCase() === 'individual').length;
      const intensCount = cond.filter((r) => r.group_type?.toLowerCase() === 'intensive').length;
      const totalAttended = cond.reduce((s, r) => s + (r.students_attended || 0), 0);
      const avgAtt = cond.length
        ? Math.round(cond.reduce((s, r) => s + (r.attendance_pct || 0), 0) / cond.length)
        : 0;

      return {
        week: wk,
        scheduled: rows.length,
        conducted: cond.length,
        groupCount,
        indivCount,
        intensCount,
        totalAttended,
        avgAtt,
      };
    });
  }, [filteredRecords]);

  const courseSummary = useMemo(() => {
    const map = new Map();
    for (const cls of groupClasses) {
      const cName = cls.course || 'Other';
      if (!map.has(cName)) {
        map.set(cName, {
          course: cName,
          class_count: 0,
          kids_count: 0,
          conducted_lessons: 0,
        });
      }
      const entry = map.get(cName);
      entry.class_count += 1;
      entry.kids_count += cls.kids_count;
      entry.conducted_lessons += cls.conducted_count;
    }
    return Array.from(map.values()).sort((a, b) => b.kids_count - a.kids_count);
  }, [groupClasses]);

  const lesson1Records = useMemo(() => {
    return filteredRecords
      .filter((r) => !r.is_test_group && r.lesson_number === 1)
      .sort((a, b) => (a.lesson_date || '').localeCompare(b.lesson_date || ''));
  }, [filteredRecords]);

  const lesson1ByCourse = useMemo(() => {
    const map = new Map();
    for (const r of lesson1Records) {
      const cName = r.course || 'Other';
      if (!map.has(cName)) {
        map.set(cName, {
          course: cName,
          total_classes: 0,
          conducted_classes: 0,
          total_kids: 0,
        });
      }
      const item = map.get(cName);
      item.total_classes += 1;
      if (r.is_conducted) item.conducted_classes += 1;
      item.total_kids += Math.max(r.students_count || 0, r.students_attended || 0);
    }
    return Array.from(map.values()).sort((a, b) => b.total_classes - a.total_classes);
  }, [lesson1Records]);

  const multiple4Count = useMemo(
    () =>
      filteredRecords.filter(
        (r) => !r.is_test_group && r.lesson_number > 0 && r.lesson_number % 4 === 0
      ).length,
    [filteredRecords]
  );

  const matchTutorUser = (teacherName) => {
    if (!teacherName) return null;
    const clean = teacherName.toLowerCase().trim();
    return (
      tutors.find((u) => u.full_name?.toLowerCase().trim() === clean) ||
      tutors.find(
        (u) =>
          u.full_name?.toLowerCase().includes(clean) ||
          clean.includes(u.full_name?.toLowerCase().trim() || '___')
      ) ||
      null
    );
  };

  const handleImportSubmit = async () => {
    if (!importFile) {
      toast.error('Please select a CSV or Excel file from BO first');
      return;
    }

    setImporting(true);
    try {
      const parsed = await parseBoScheduleFile(importFile);
      if (!parsed.length) {
        toast.error('No valid schedule rows were found in the file');
        setImporting(false);
        return;
      }

      const chunkSize = 300;
      for (let i = 0; i < parsed.length; i += chunkSize) {
        const batch = parsed.slice(i, i + chunkSize).map((item) => ({
          ...item,
          updated_date: new Date().toISOString(),
        }));

        const { error: upsertErr } = await supabase
          .from('BoScheduleRecord')
          .upsert(batch, { onConflict: 'unique_key' });

        if (upsertErr) throw upsertErr;
      }

      const eligibleMultiple4 = parsed.filter(
        (r) =>
          !r.is_test_group &&
          r.lesson_number > 0 &&
          r.lesson_number % 4 === 0 &&
          r.lesson_date >= cutoffDate
      );

      let assignedCount = 0;
      if (eligibleMultiple4.length > 0) {
        const { data: existingTasks } = await supabase
          .from('TutorTask')
          .select('title, linked_class_name')
          .eq('category', 'Student Feedback');

        const existingSignatures = new Set(
          (existingTasks || []).map(
            (t) => `${(t.linked_class_name || '').toLowerCase()}__${(t.title || '').toLowerCase()}`
          )
        );

        const now = new Date().toISOString();
        const tasksToCreate = [];

        for (const row of eligibleMultiple4) {
          const matchedUser = matchTutorUser(row.lesson_teacher);
          const taskTitle = `Weekly Report - ${row.group_title} (Lesson ${row.lesson_number})`;
          const sig = `${row.group_title.toLowerCase()}__${taskTitle.toLowerCase()}`;

          if (existingSignatures.has(sig)) continue;
          existingSignatures.add(sig);

          const weekBounds = getWeekBoundsFromDate(row.lesson_date);

          tasksToCreate.push({
            id: makeId(),
            group_id: makeId(),
            title: taskTitle,
            description: `Auto-generated from BO Schedule.\nClass: ${row.group_title} (ID: ${row.group_id})\nCourse: ${row.course}\nLesson: Lesson ${row.lesson_number} (${row.lesson_title})\nSchedule: ${row.lesson_datetime}`,
            category: 'Student Feedback',
            priority: 'High',
            start_date: row.lesson_date,
            deadline: weekBounds.end,
            status: 'pending',
            assigned_tutor_id: matchedUser?.id || null,
            assigned_tutor_name: matchedUser?.full_name || row.lesson_teacher || 'Unassigned Tutor',
            assigned_by_id: currentUser?.id || null,
            assigned_by_name: currentUser?.full_name || 'System (BO Import)',
            progress_notes: '',
            completion_notes: '',
            revision_note: '',
            revision_requested: false,
            linked_week_start_date: weekBounds.start,
            linked_week_end_date: weekBounds.end,
            linked_class_name: row.group_title,
            created_date: now,
            updated_date: now,
            created_by_id: currentUser?.id || null,
            is_sample: false,
          });
        }

        if (tasksToCreate.length > 0) {
          const { error: taskErr } = await supabase.from('TutorTask').insert(tasksToCreate);
          if (taskErr) {
            console.error('Auto-assign task warning:', taskErr.message);
          } else {
            assignedCount = tasksToCreate.length;
          }
        }
      }

      toast.success(`Successfully imported ${parsed.length} BO schedules!`, {
        description:
          assignedCount > 0
            ? `${assignedCount} Weekly Reports (every 4th lesson starting ${cutoffDate}) were automatically assigned to tutors.`
            : `Dashboard summary updated (no new 4th-lesson schedules starting ${cutoffDate}).`,
      });

      setImportOpen(false);
      setImportFile(null);
      await loadData();
    } catch (err) {
      toast.error('Import failed', { description: err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!filteredRecords.length) {
      toast.error('No data available in the current filter to export');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const sheet1Rows = [
        ...weeklySummary.map((w) => ({
          Section: 'Weekly Breakdown',
          Item: w.week,
          'Total Scheduled': w.scheduled,
          'Lessons Conducted': w.conducted,
          Group: w.groupCount,
          Individual: w.indivCount,
          Intensive: w.intensCount,
          'Students Attended': w.totalAttended,
          'Avg Attendance (%)': `${w.avgAtt}%`,
        })),
        {},
        ...courseSummary.map((c) => ({
          Section: 'Course Distribution',
          Item: c.course,
          'Total Scheduled': '-',
          'Lessons Conducted': c.conducted_lessons,
          Group: `${c.class_count} classes`,
          Individual: `${c.kids_count} kids`,
          Intensive: '-',
          'Students Attended': c.kids_count,
          'Avg Attendance (%)': '-',
        })),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet1Rows), 'Weekly & Course Summary');

      const ws2 = XLSX.utils.json_to_sheet(
        groupClasses.map((c, i) => ({
          No: i + 1,
          'Group ID': c.group_id,
          'Group Title': c.group_title,
          Type: c.group_type,
          Course: c.course,
          Teacher: c.teacher,
          'Kids Count': c.kids_count,
          'Lessons Conducted': c.conducted_count,
          'Latest Lesson': c.latest_lesson,
          'Avg Attendance (%)': `${c.avg_attendance}%`,
        }))
      );
      XLSX.utils.book_append_sheet(wb, ws2, 'Group Classes & Kids');

      const ws3 = XLSX.utils.json_to_sheet(
        lesson1Records.map((r, i) => ({
          No: i + 1,
          Date: r.lesson_date,
          Time: r.lesson_time,
          'Group ID': r.group_id,
          'Group Title': r.group_title,
          Course: r.course,
          Type: r.group_type,
          Teacher: r.lesson_teacher || '-',
          Kids: Math.max(r.students_count || 0, r.students_attended || 0),
          Status: r.is_conducted ? 'Conducted' : 'Not Conducted',
        }))
      );
      XLSX.utils.book_append_sheet(wb, ws3, 'Lesson 1 Classes');

      const ws4 = XLSX.utils.json_to_sheet(
        filteredRecords.map((r, i) => ({
          No: i + 1,
          Date: r.lesson_date,
          Time: r.lesson_time,
          Week: r.week_label,
          Lesson: r.lesson_number,
          'Lesson Title': r.lesson_title,
          'Group ID': r.group_id,
          'Group Title': r.group_title,
          'Attendance (%)': `${r.attendance_pct}%`,
          Students: r.students_raw,
          Attended: r.students_attended,
          Teacher: r.lesson_teacher || '-',
          Type: r.group_type,
          Course: r.course,
          Conducted: r.is_conducted ? 'Yes' : 'No',
        }))
      );
      XLSX.utils.book_append_sheet(wb, ws4, 'Raw Schedule');

      const monthLabel =
        selectedMonth === 'all'
          ? 'AllMonths'
          : MONTHS.find((m) => m.value === selectedMonth)?.label || selectedMonth;
      XLSX.writeFile(wb, `Tutor_Administration_${monthLabel}_${selectedYear}.xlsx`);
      toast.success('Tutor Administration Excel file downloaded');
    } catch (err) {
      toast.error('Failed to export Excel', { description: err.message });
    }
  };

  const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
  const paginatedRaw = filteredRecords.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tutor Administration</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            BO LMS attendance summary, group classes, kids per course, monthly Lesson 1, & auto-assign every 4th-lesson Weekly Report.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportExcel} className="border-border gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </Button>
          <Button onClick={() => setImportOpen(true)} className="bg-primary hover:bg-primary/90 gap-2">
            <Upload className="w-4 h-4" /> Import CSV / Excel BO
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger><SelectValue placeholder="Week" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Weeks (W1–W4)</SelectItem>
              {WEEKS.map((w) => (
                <SelectItem key={w} value={w}>{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger><SelectValue placeholder="Course" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courseOptions.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedTutor} onValueChange={setSelectedTutor}>
            <SelectTrigger><SelectValue placeholder="Tutor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tutors</SelectItem>
              {teacherOptions.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search class / ID / tutor..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pt-1">
          <span>
            Showing <strong>{filteredRecords.length}</strong> schedules ({conductedRecords.length} valid conducted lessons) · Total database: {records.length} rows
          </span>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeTest}
              onChange={(e) => setIncludeTest(e.target.checked)}
              className="rounded border-border"
            />
            <span>Show Test Groups</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Lessons Conducted" value={conductedRecords.length} sub={`out of ${filteredRecords.length} schedules`} icon={CalendarCheck} tone="bg-primary" />
        <KpiCard label="Active Classes" value={groupClasses.length} sub="Group / Indiv / Intensive" icon={BookOpen} tone="bg-chart-3" />
        <KpiCard label="Total Kids" value={totalKids} sub="Accumulated students per class" icon={Users} tone="bg-accent" />
        <KpiCard label="Lesson 1 This Month" value={lesson1Records.length} sub={`${lesson1ByCourse.length} distinct courses`} icon={Sparkles} tone="bg-chart-4" />
        <KpiCard label="Avg Attendance" value={`${avgAttendance}%`} sub="Average across conducted classes" icon={Percent} tone="bg-chart-2" />
        <KpiCard label="Every 4th Lesson" value={multiple4Count} sub="Lesson 4, 8, 12, 16..." icon={Bell} tone="bg-chart-5" />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {[
          { id: 'overview', label: 'Weekly & Course Summary' },
          { id: 'classes', label: `Group Classes & Kids (${groupClasses.length})` },
          { id: 'lesson1', label: `Lesson 1 This Month (${lesson1Records.length})` },
          { id: 'raw', label: `Schedule Log (${filteredRecords.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-2xl p-5">
                <h2 className="font-semibold text-foreground mb-1">Attendance & Lessons per Week</h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Valid criteria: non-Test Group, S Lesson Status &gt; 0%, and Students Attended ≥ 1.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="py-2.5 font-medium">Period</th>
                        <th className="py-2.5 font-medium text-center">Conducted</th>
                        <th className="py-2.5 font-medium text-center">Group</th>
                        <th className="py-2.5 font-medium text-center">Indiv</th>
                        <th className="py-2.5 font-medium text-center">Intensive</th>
                        <th className="py-2.5 font-medium text-center">Attended</th>
                        <th className="py-2.5 font-medium text-right">Avg %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {weeklySummary.map((w) => (
                        <tr key={w.week}>
                          <td className="py-2.5 font-medium text-foreground">{w.week}</td>
                          <td className="py-2.5 text-center font-semibold text-primary">{w.conducted}</td>
                          <td className="py-2.5 text-center text-muted-foreground">{w.groupCount}</td>
                          <td className="py-2.5 text-center text-muted-foreground">{w.indivCount}</td>
                          <td className="py-2.5 text-center text-muted-foreground">{w.intensCount}</td>
                          <td className="py-2.5 text-center text-foreground">{w.totalAttended}</td>
                          <td className="py-2.5 text-right font-medium text-chart-3">{w.avgAtt}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-5">
                <h2 className="font-semibold text-foreground mb-1">Class & Kids Distribution per Course</h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Active classes, total kids, and conducted lessons per course.
                </p>
                {courseSummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No data available for this filter.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b border-border">
                          <th className="py-2.5 font-medium">Course</th>
                          <th className="py-2.5 font-medium text-center">Classes</th>
                          <th className="py-2.5 font-medium text-center">Total Kids</th>
                          <th className="py-2.5 font-medium text-right">Conducted</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {courseSummary.map((c) => (
                          <tr key={c.course}>
                            <td className="py-2.5 font-medium text-foreground max-w-[260px] truncate" title={c.course}>
                              {c.course}
                            </td>
                            <td className="py-2.5 text-center text-foreground">{c.class_count}</td>
                            <td className="py-2.5 text-center font-semibold text-primary">{c.kids_count}</td>
                            <td className="py-2.5 text-right text-chart-3 font-medium">{c.conducted_lessons}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'classes' && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-medium">Group ID</th>
                      <th className="px-4 py-3 font-medium">Class Name</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Course</th>
                      <th className="px-4 py-3 font-medium">Tutor</th>
                      <th className="px-4 py-3 font-medium text-center">Kids</th>
                      <th className="px-4 py-3 font-medium text-center">Conducted</th>
                      <th className="px-4 py-3 font-medium text-center">Latest Lesson</th>
                      <th className="px-4 py-3 font-medium text-right">Avg Att</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {groupClasses.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-muted-foreground text-sm">
                          No class data found for this filter.
                        </td>
                      </tr>
                    ) : (
                      groupClasses.map((cls) => (
                        <tr key={`${cls.group_id}-${cls.group_title}`} className="hover:bg-secondary/30">
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{cls.group_id}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{cls.group_title}</td>
                          <td className="px-4 py-3 text-xs">
                            <span className="px-2 py-0.5 rounded-full bg-secondary text-foreground">
                              {cls.group_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px] truncate" title={cls.course}>
                            {cls.course}
                          </td>
                          <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">{cls.teacher}</td>
                          <td className="px-4 py-3 text-center font-semibold text-primary">{cls.kids_count}</td>
                          <td className="px-4 py-3 text-center text-foreground">{cls.conducted_count}</td>
                          <td className="px-4 py-3 text-center text-xs">
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                              Lesson {cls.latest_lesson}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-medium text-chart-3">
                            {cls.avg_attendance}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'lesson1' && (
            <div className="space-y-5">
              <div className="bg-card border border-border rounded-2xl p-5">
                <h2 className="font-semibold text-foreground mb-3">Lesson 1 Course Summary (New Classes)</h2>
                {lesson1ByCourse.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No Lesson 1 schedules found in this period.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {lesson1ByCourse.map((item) => (
                      <div key={item.course} className="border border-border rounded-xl p-3.5 bg-secondary/30">
                        <div className="text-sm font-semibold text-foreground truncate" title={item.course}>
                          {item.course}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>Total: <strong className="text-foreground">{item.total_classes}</strong> classes</span>
                          <span>Conducted: <strong className="text-chart-3">{item.conducted_classes}</strong></span>
                          <span>Kids: <strong className="text-primary">{item.total_kids}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-xs text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-4 py-3 font-medium">Date & Time</th>
                        <th className="px-4 py-3 font-medium">Class Name</th>
                        <th className="px-4 py-3 font-medium">Course</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Tutor</th>
                        <th className="px-4 py-3 font-medium text-center">Kids</th>
                        <th className="px-4 py-3 font-medium text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {lesson1Records.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-muted-foreground text-sm">
                            No Lesson 1 classes found for this filter.
                          </td>
                        </tr>
                      ) : (
                        lesson1Records.map((r) => (
                          <tr key={r.id || r.unique_key} className="hover:bg-secondary/30">
                            <td className="px-4 py-3 text-xs whitespace-nowrap text-foreground">
                              {r.lesson_date} · {r.lesson_time}
                            </td>
                            <td className="px-4 py-3 font-medium text-foreground">{r.group_title}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{r.course}</td>
                            <td className="px-4 py-3 text-xs">{r.group_type}</td>
                            <td className="px-4 py-3 text-xs text-foreground">{r.lesson_teacher || '-'}</td>
                            <td className="px-4 py-3 text-center font-medium text-primary">
                              {Math.max(r.students_count || 0, r.students_attended || 0)}
                            </td>
                            <td className="px-4 py-3 text-right text-xs">
                              {r.is_conducted ? (
                                <span className="px-2 py-0.5 rounded-full bg-chart-3/15 text-chart-3 font-medium">
                                  Conducted ({r.attendance_pct}%)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                                  Scheduled / 0%
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
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-3 py-3 font-medium">Date & Time</th>
                        <th className="px-3 py-3 font-medium">Week</th>
                        <th className="px-3 py-3 font-medium">Lesson</th>
                        <th className="px-3 py-3 font-medium">Group Title</th>
                        <th className="px-3 py-3 font-medium">Course</th>
                        <th className="px-3 py-3 font-medium">Tutor</th>
                        <th className="px-3 py-3 font-medium text-center">Att %</th>
                        <th className="px-3 py-3 font-medium text-center">Attended</th>
                        <th className="px-3 py-3 font-medium text-right">Flag</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedRaw.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-muted-foreground">
                            No schedules found.
                          </td>
                        </tr>
                      ) : (
                        paginatedRaw.map((r) => {
                          const isMultiple4 = !r.is_test_group && r.lesson_number > 0 && r.lesson_number % 4 === 0;
                          return (
                            <tr key={r.id || r.unique_key} className="hover:bg-secondary/30">
                              <td className="px-3 py-2.5 whitespace-nowrap text-foreground">
                                {r.lesson_date} {r.lesson_time}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{r.week_label}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-primary">
                                L{r.lesson_number}
                              </td>
                              <td className="px-3 py-2.5 font-medium text-foreground">{r.group_title}</td>
                              <td className="px-3 py-2.5 text-muted-foreground max-w-[200px] truncate" title={r.course}>
                                {r.course}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-foreground">
                                {r.lesson_teacher || '-'}
                              </td>
                              <td className="px-3 py-2.5 text-center font-medium">{r.attendance_pct}%</td>
                              <td className="px-3 py-2.5 text-center">{r.students_attended}</td>
                              <td className="px-3 py-2.5 text-right whitespace-nowrap space-x-1">
                                {isMultiple4 && (
                                  <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                                    Weekly Report (L{r.lesson_number})
                                  </span>
                                )}
                                {r.is_conducted ? (
                                  <span className="px-2 py-0.5 rounded-full bg-chart-3/15 text-chart-3">
                                    Conducted
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                                    {r.is_test_group ? 'Test' : '0%'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {totalPages > 1 && (
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Upload className="w-5 h-5 text-primary" /> Import BO LMS Schedule
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Upload a CSV or Excel file exported from BO LMS. Data will be automatically summarized on the dashboard.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground/80 block">
                BO Schedule File (.csv / .xlsx)
              </label>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="cursor-pointer"
              />
              {importFile && (
                <p className="text-xs text-chart-3 flex items-center gap-1 mt-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {importFile.name}
                </p>
              )}
            </div>

            <div className="bg-secondary/40 border border-border rounded-xl p-3.5 space-y-2">
              <label className="text-xs font-semibold text-foreground block">
                Start Auto-Assign Weekly Report (Lesson 4, 8, 12, ...)
              </label>
              <Input
                type="date"
                value={cutoffDate}
                onChange={(e) => setCutoffDate(e.target.value)}
                className="bg-card"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Every 4th-lesson schedules <strong>before this date</strong> will only be recorded in the dashboard summary and will{' '}
                <strong>not</strong> generate tutor tasks. Schedules from this date onward will automatically appear in each tutor&apos;s{' '}
                <strong>My Assigned Tasks</strong> with the corresponding class name.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleImportSubmit} disabled={importing} className="bg-primary hover:bg-primary/90 gap-2">
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                Import & Process Data
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}