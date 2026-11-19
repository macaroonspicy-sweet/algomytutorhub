import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAppAuth } from '@/lib/AppAuthContext';
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
  ShieldCheck,
  Plus,
  Search,
  FileSpreadsheet,
  Calendar,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Users,
  Trash2,
  Eye,
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

export default function TutorDiscipline() {
  const { currentUser } = useAppAuth();

  const [loading, setLoading] = useState(true);
  const [tutors, setTutors] = useState([]);
  const [scheduleRecords, setScheduleRecords] = useState([]);
  const [feedbackAssignments, setFeedbackAssignments] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [meetingAttendances, setMeetingAttendances] = useState([]);

  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState('2026');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('table'); // 'table' | 'meetings'

  // Record Meeting Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [topic, setTopic] = useState('');
  const [attendanceMap, setAttendanceMap] = useState({});
  const [modalSearch, setModalSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // View & Edit Meeting Detail Modal State
  const [selectedMeetingDetail, setSelectedMeetingDetail] = useState(null);
  const [editAttendanceMap, setEditAttendanceMap] = useState({});
  const [editModalSearch, setEditModalSearch] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const { data: userData, error: userErr } = await supabase
        .from('CustomUser')
        .select('id, full_name, username, role, is_active')
        .in('role', ['Tutor', 'Team Leader'])
        .order('full_name', { ascending: true });

      if (userErr) throw userErr;
      const activeUsers = (userData || []).filter((u) => u.is_active !== false);
      setTutors(activeUsers);

      let allSchedules = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('BoScheduleRecord')
          .select('id, lesson_teacher, lesson_month, lesson_year, is_conducted, is_test_group')
          .range(from, from + step - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allSchedules = allSchedules.concat(data);
        if (data.length < step) break;
        from += step;
      }
      setScheduleRecords(allSchedules);

      const { data: assignData, error: assignErr } = await supabase
        .from('WeeklyFeedbackAssignment')
        .select('*');
      if (assignErr) throw assignErr;
      setFeedbackAssignments(assignData || []);

      const { data: meetData, error: meetErr } = await supabase
        .from('TutorMeeting')
        .select('*')
        .order('meeting_date', { ascending: false });
      if (meetErr) throw meetErr;
      setMeetings(meetData || []);

      const { data: attData, error: attErr } = await supabase
        .from('TutorMeetingAttendance')
        .select('*');
      if (attErr) throw attErr;
      setMeetingAttendances(attData || []);
    } catch (err) {
      toast.error('Failed to load Discipline data', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (!m.meeting_date) return false;
      const [y, mStr] = m.meeting_date.split('-');
      if (selectedYear !== 'all' && y !== selectedYear) return false;
      if (selectedMonth !== 'all' && String(Number(mStr)) !== selectedMonth) return false;
      return true;
    });
  }, [meetings, selectedMonth, selectedYear]);

  const disciplineRows = useMemo(() => {
    const filteredMeetingIds = new Set(filteredMeetings.map((m) => m.id));

    return tutors
      .map((tutor) => {
        const tName = tutor.full_name || tutor.username || 'Unknown';

        // 1. Completed Classes from BoScheduleRecord
        const completedClasses = scheduleRecords.filter((r) => {
          if (r.is_test_group || !r.is_conducted) return false;
          if (selectedYear !== 'all' && String(r.lesson_year) !== selectedYear) return false;
          if (selectedMonth !== 'all' && String(r.lesson_month) !== selectedMonth) return false;
          return isSameTutor(r.lesson_teacher, tName);
        }).length;

        // 2. Monthly Feedback Target & Submitted (Lesson 4 multiples per class assignment)
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
          } else if (a.month && selectedMonth !== 'all') {
            const monthLabel = MONTHS.find((m) => m.value === selectedMonth)?.label.toLowerCase();
            if (
              String(a.month) !== selectedMonth &&
              !String(a.month).toLowerCase().includes(monthLabel || '___')
            ) {
              return false;
            }
          }
          return true;
        });

        const feedbackTarget = tutorAssignments.length;
        const feedbackSubmitted = tutorAssignments.filter(isAssignmentCompleted).length;

        const feedbackPct =
          feedbackTarget > 0
            ? Math.min(100, Math.round((feedbackSubmitted / feedbackTarget) * 100))
            : null;

        // 3. Meeting Presence % (Present = 100%, Excused = 75%, Absent = 0%)
        const tutorMeetingRecords = meetingAttendances.filter(
          (att) =>
            filteredMeetingIds.has(att.meeting_id) &&
            (att.tutor_id === tutor.id || isSameTutor(att.tutor_name, tName))
        );

        let meetingPct = null;
        let meetingSummaryText = '-';
        if (tutorMeetingRecords.length > 0) {
          const presentCount = tutorMeetingRecords.filter(
            (r) => normalizeAttendanceStatus(r.status) === 'Present'
          ).length;
          const excusedCount = tutorMeetingRecords.filter(
            (r) => normalizeAttendanceStatus(r.status) === 'Excused'
          ).length;
          const weightedScore = presentCount * 1 + excusedCount * 0.75;
          meetingPct = Math.round((weightedScore / tutorMeetingRecords.length) * 100);
          meetingSummaryText = `${meetingPct}% (${presentCount}/${tutorMeetingRecords.length})`;
        }

        // 4. Overall Discipline % & Status
        const components = [feedbackPct, meetingPct].filter((v) => v !== null);
        const disciplinePct =
          components.length > 0
            ? Math.round(components.reduce((a, b) => a + b, 0) / components.length)
            : null;

        let status = '-';
        if (disciplinePct !== null) {
          if (disciplinePct >= 90) status = 'High Performer';
          else if (disciplinePct >= 80) status = 'Stable Performer';
          else status = 'Need Improvement';
        }

        return {
          id: tutor.id,
          teacherName: tName,
          completedClasses,
          feedbackSubmitted,
          feedbackTarget,
          feedbackPct,
          meetingPct,
          meetingSummaryText,
          disciplinePct,
          status,
        };
      })
      .sort((a, b) => {
        if (a.disciplinePct === null && b.disciplinePct === null) {
          return a.teacherName.localeCompare(b.teacherName);
        }
        if (a.disciplinePct === null) return 1;
        if (b.disciplinePct === null) return -1;
        if (b.disciplinePct !== a.disciplinePct) {
          return b.disciplinePct - a.disciplinePct;
        }
        return a.teacherName.localeCompare(b.teacherName);
      });
  }, [
    tutors,
    scheduleRecords,
    feedbackAssignments,
    meetingAttendances,
    filteredMeetings,
    selectedMonth,
    selectedYear,
  ]);

  const searchedRows = useMemo(() => {
    if (!search.trim()) return disciplineRows;
    const q = search.toLowerCase();
    return disciplineRows.filter((r) => r.teacherName.toLowerCase().includes(q));
  }, [disciplineRows, search]);

  const totalCompletedClasses = useMemo(
    () => disciplineRows.reduce((s, r) => s + r.completedClasses, 0),
    [disciplineRows]
  );
  const totalFeedbackTarget = useMemo(
    () => disciplineRows.reduce((s, r) => s + r.feedbackTarget, 0),
    [disciplineRows]
  );
  const totalFeedbackSubmitted = useMemo(
    () => disciplineRows.reduce((s, r) => s + r.feedbackSubmitted, 0),
    [disciplineRows]
  );
  const avgDiscipline = useMemo(() => {
    const valid = disciplineRows.filter((r) => r.disciplinePct !== null);
    if (!valid.length) return null;
    return Math.round(valid.reduce((s, r) => s + r.disciplinePct, 0) / valid.length);
  }, [disciplineRows]);

  const openRecordModal = () => {
    const initialMap = {};
    tutors.forEach((t) => {
      initialMap[t.id] = {
        tutor_id: t.id,
        tutor_name: t.full_name || t.username || 'Unknown',
        status: 'Present',
        notes: '',
      };
    });
    setAttendanceMap(initialMap);
    setMeetingDate(new Date().toISOString().split('T')[0]);
    setTopic('');
    setModalSearch('');
    setModalOpen(true);
  };

  const handleStatusChange = (tutorId, status) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [tutorId]: { ...prev[tutorId], status: normalizeAttendanceStatus(status) },
    }));
  };

  const handleNotesChange = (tutorId, notes) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [tutorId]: { ...prev[tutorId], notes },
    }));
  };

  const handleMarkAllPresent = () => {
    setAttendanceMap((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        next[k] = { ...next[k], status: 'Present' };
      });
      return next;
    });
  };

  const handleSaveMeeting = async (e) => {
    e.preventDefault();
    if (!meetingDate || !topic.trim()) {
      toast.error('Please enter both meeting date and discussion topic');
      return;
    }

    setSubmitting(true);
    try {
      const { data: createdMeeting, error: mErr } = await supabase
        .from('TutorMeeting')
        .insert([
          {
            meeting_date: meetingDate,
            topic: topic.trim(),
            created_by: currentUser?.id || null,
          },
        ])
        .select()
        .single();

      if (mErr) throw mErr;

      const rows = Object.values(attendanceMap).map((item) => ({
        meeting_id: createdMeeting.id,
        tutor_id: item.tutor_id,
        tutor_name: item.tutor_name,
        status: normalizeAttendanceStatus(item.status),
        notes: item.notes?.trim() || null,
      }));

      const { error: aErr } = await supabase.from('TutorMeetingAttendance').insert(rows);
      if (aErr) throw aErr;

      toast.success('Meeting attendance saved successfully');
      setModalOpen(false);
      await loadAllData();
    } catch (err) {
      toast.error('Failed to save meeting attendance', { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const openMeetingDetailModal = (meeting, records) => {
    const map = {};
    records.forEach((rec) => {
      map[rec.id] = {
        status: normalizeAttendanceStatus(rec.status),
        notes: rec.notes || '',
      };
    });
    setEditAttendanceMap(map);
    setEditModalSearch('');
    setSelectedMeetingDetail({ meeting, records });
  };

  const handleEditStatusChange = (recordId, status) => {
    setEditAttendanceMap((prev) => ({
      ...prev,
      [recordId]: {
        ...(prev[recordId] || { notes: '' }),
        status: normalizeAttendanceStatus(status),
      },
    }));
  };

  const handleEditNotesChange = (recordId, notes) => {
    setEditAttendanceMap((prev) => ({
      ...prev,
      [recordId]: {
        ...(prev[recordId] || { status: 'Present' }),
        notes,
      },
    }));
  };

  const handleSaveEditedAttendance = async () => {
    if (!selectedMeetingDetail?.records?.length) return;
    setSavingEdit(true);
    try {
      await Promise.all(
        selectedMeetingDetail.records.map(async (rec) => {
          const updated = editAttendanceMap[rec.id];
          if (!updated) return;
          const { error } = await supabase
            .from('TutorMeetingAttendance')
            .update({
              status: normalizeAttendanceStatus(updated.status),
              notes: updated.notes?.trim() || null,
            })
            .eq('id', rec.id);
          if (error) throw error;
        })
      );

      toast.success('Meeting attendance updated');
      setSelectedMeetingDetail(null);
      await loadAllData();
    } catch (err) {
      toast.error('Failed to update meeting attendance', { description: err.message });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteMeeting = async (meetingId) => {
    if (!window.confirm('Delete this meeting attendance record?')) return;
    try {
      const { error } = await supabase.from('TutorMeeting').delete().eq('id', meetingId);
      if (error) throw error;
      toast.success('Meeting record deleted');
      await loadAllData();
    } catch (err) {
      toast.error('Failed to delete meeting', { description: err.message });
    }
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const sheetRows = searchedRows.map((r, idx) => ({
        Rating: idx + 1,
        'Teacher Name': r.teacherName,
        'Completed Classes': r.completedClasses,
        'Monthly Feedback Submitted': r.feedbackTarget > 0 ? r.feedbackSubmitted : '-',
        'Monthly Feedback Target': r.feedbackTarget > 0 ? r.feedbackTarget : '-',
        'Meeting Presence': r.meetingSummaryText,
        'Discipline %': r.disciplinePct !== null ? `${r.disciplinePct}%` : '-',
        Status: r.status,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), 'Discipline');
      const mLabel =
        selectedMonth === 'all'
          ? 'AllMonths'
          : MONTHS.find((m) => m.value === selectedMonth)?.label || selectedMonth;
      XLSX.writeFile(wb, `Tutor_Discipline_${mLabel}_${selectedYear}.xlsx`);
      toast.success('Discipline report downloaded');
    } catch (err) {
      toast.error('Export failed', { description: err.message });
    }
  };

  const modalFilteredTutors = useMemo(() => {
    if (!modalSearch.trim()) return tutors;
    const q = modalSearch.toLowerCase();
    return tutors.filter((t) => (t.full_name || '').toLowerCase().includes(q));
  }, [tutors, modalSearch]);

  const modalCounts = useMemo(() => {
    const vals = Object.values(attendanceMap);
    return {
      present: vals.filter((v) => v.status === 'Present').length,
      excused: vals.filter((v) => v.status === 'Excused').length,
      absent: vals.filter((v) => v.status === 'Absent').length,
    };
  }, [attendanceMap]);

  const editModalCounts = useMemo(() => {
    const vals = Object.values(editAttendanceMap);
    return {
      present: vals.filter((v) => v.status === 'Present').length,
      excused: vals.filter((v) => v.status === 'Excused').length,
      absent: vals.filter((v) => v.status === 'Absent').length,
    };
  }, [editAttendanceMap]);

  const editFilteredRecords = useMemo(() => {
    const sorted = (selectedMeetingDetail?.records || [])
      .slice()
      .sort((a, b) => (a.tutor_name || '').localeCompare(b.tutor_name || ''));
    if (!editModalSearch.trim()) return sorted;
    const q = editModalSearch.toLowerCase();
    return sorted.filter((r) => (r.tutor_name || '').toLowerCase().includes(q));
  }, [selectedMeetingDetail, editModalSearch]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-primary" />
            Tutor Discipline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Updated every week • Synced from Completed Classes, Monthly Feedback (Lesson 4 multiples), and QC Meeting Presence.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportExcel} className="border-border gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </Button>
          <Button onClick={openRecordModal} className="bg-primary hover:bg-primary/90 gap-2">
            <Plus className="w-4 h-4" /> Record Meeting Attendance
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-xs font-medium text-muted-foreground">Active Tutors</div>
          <div className="text-2xl font-bold text-foreground mt-1">{disciplineRows.length}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Ranked by Discipline %</div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-xs font-medium text-muted-foreground">Completed Classes</div>
          <div className="text-2xl font-bold text-primary mt-1">{totalCompletedClasses}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Conducted lessons in period</div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-xs font-medium text-muted-foreground">Monthly Feedback Progress</div>
          <div className="text-2xl font-bold text-foreground mt-1">
            {totalFeedbackSubmitted}{' '}
            <span className="text-sm font-normal text-muted-foreground">/ {totalFeedbackTarget}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {totalFeedbackTarget > 0
              ? `${Math.round((totalFeedbackSubmitted / totalFeedbackTarget) * 100)}% of Lesson 4 classes`
              : 'No Lesson 4 target assigned yet'}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-xs font-medium text-muted-foreground">QC Meetings Recorded</div>
          <div className="text-2xl font-bold text-chart-3 mt-1">{filteredMeetings.length}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Avg Discipline: {avgDiscipline !== null ? `${avgDiscipline}%` : '-'}
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab('table')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'table'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          Discipline Table ({searchedRows.length})
        </button>
        <button
          onClick={() => setActiveTab('meetings')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'meetings'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          Meeting Presence Log ({filteredMeetings.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : activeTab === 'table' ? (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-amber-50/90 border-b border-amber-200/70 text-xs text-slate-700">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold w-16 text-center">Rating</th>
                  <th className="px-4 py-3 font-semibold">Teacher Name</th>
                  <th className="px-4 py-3 font-semibold text-center">Completed Classes</th>
                  <th className="px-4 py-3 font-semibold text-center">Monthly Feedback Submitted</th>
                  <th className="px-4 py-3 font-semibold text-center">Monthly Feedback Target</th>
                  <th className="px-4 py-3 font-semibold text-center">Meeting Presence</th>
                  <th className="px-4 py-3 font-semibold text-center">Discipline %</th>
                  <th className="px-4 py-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {searchedRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-muted-foreground text-sm">
                      No tutor records found.
                    </td>
                  </tr>
                ) : (
                  searchedRows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {row.teacherName}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-foreground">
                        {row.completedClasses}
                      </td>
                      <td className="px-4 py-3 text-center text-foreground">
                        {row.feedbackTarget > 0 ? row.feedbackSubmitted : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {row.feedbackTarget > 0 ? row.feedbackTarget : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-medium text-foreground whitespace-nowrap">
                        {row.meetingSummaryText}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-primary whitespace-nowrap">
                        {row.disciplinePct !== null ? `${row.disciplinePct}%` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                        {row.status === '-' ? (
                          <span className="text-muted-foreground">-</span>
                        ) : row.status === 'High Performer' ? (
                          <span className="inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                            {row.status}
                          </span>
                        ) : row.status === 'Stable Performer' ? (
                          <span className="inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                            {row.status}
                          </span>
                        ) : (
                          <span className="inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
                            {row.status}
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
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground border-b border-border">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Meeting Date</th>
                  <th className="px-4 py-3 font-medium">Discussion Topic</th>
                  <th className="px-4 py-3 font-medium text-center">Present</th>
                  <th className="px-4 py-3 font-medium text-center">Excused</th>
                  <th className="px-4 py-3 font-medium text-center">Absent</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMeetings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">
                      No meetings recorded for this period yet. Click{' '}
                      <strong>Record Meeting Attendance</strong> to add one.
                    </td>
                  </tr>
                ) : (
                  filteredMeetings.map((m) => {
                    const recs = meetingAttendances.filter((a) => a.meeting_id === m.id);
                    const present = recs.filter(
                      (r) => normalizeAttendanceStatus(r.status) === 'Present'
                    ).length;
                    const excused = recs.filter(
                      (r) => normalizeAttendanceStatus(r.status) === 'Excused'
                    ).length;
                    const absent = recs.filter(
                      (r) => normalizeAttendanceStatus(r.status) === 'Absent'
                    ).length;

                    return (
                      <tr key={m.id} className="hover:bg-secondary/30">
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          {m.meeting_date}
                        </td>
                        <td className="px-4 py-3 text-foreground">{m.topic}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                            {present}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                            {excused}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700">
                            {absent}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openMeetingDetailModal(m, recs)}
                            className="h-8 text-xs gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> Details / Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteMeeting(m.id)}
                            className="h-8 text-xs text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Meeting Attendance Modal (QC Team Input) */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-card border-border max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Users className="w-5 h-5 text-primary" /> Record Meeting Attendance (QC Team)
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Enter the meeting date, discussion topic, and mark each tutor&apos;s attendance status.
            </p>
          </DialogHeader>

          <form onSubmit={handleSaveMeeting} className="flex flex-col flex-1 overflow-hidden space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-secondary/40 p-3.5 rounded-xl border border-border">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">
                  Meeting Date <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    required
                    className="pl-9 bg-card"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-foreground mb-1 block">
                  Discussion Topic <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="text"
                    placeholder="e.g., Biweekly QC Evaluation & Mentimeter Training"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    required
                    className="pl-9 bg-card"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Present: {modalCounts.present}
                </span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">
                  <Clock className="w-3.5 h-3.5" /> Excused: {modalCounts.excused}
                </span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-medium border border-rose-200">
                  <XCircle className="w-3.5 h-3.5" /> Absent: {modalCounts.absent}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search tutor..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="h-8 text-xs w-44"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllPresent}
                  className="h-8 text-xs"
                >
                  Mark All Present
                </Button>
              </div>
            </div>

            <div className="border border-border rounded-xl overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs text-muted-foreground sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2.5 w-10">#</th>
                    <th className="px-3 py-2.5">Tutor Name</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Notes (Optional)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {modalFilteredTutors.map((t, idx) => {
                    const entry = attendanceMap[t.id] || { status: 'Present', notes: '' };
                    return (
                      <tr key={t.id} className="hover:bg-secondary/20">
                        <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                          {t.full_name || t.username}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="inline-flex rounded-lg border border-border p-0.5 bg-secondary/40">
                            {['Present', 'Excused', 'Absent'].map((opt) => {
                              const active = entry.status === opt;
                              let cls = 'text-muted-foreground hover:text-foreground';
                              if (active) {
                                if (opt === 'Present') cls = 'bg-emerald-600 text-white';
                                if (opt === 'Excused') cls = 'bg-amber-500 text-white';
                                if (opt === 'Absent') cls = 'bg-rose-600 text-white';
                              }
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => handleStatusChange(t.id, opt)}
                                  className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition ${cls}`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={entry.notes}
                            onChange={(e) => handleNotesChange(t.id, e.target.value)}
                            placeholder={entry.status === 'Excused' ? 'Reason...' : 'Note...'}
                            className="h-7 text-xs"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-primary hover:bg-primary/90 gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Meeting Attendance
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View & Edit Meeting Detail Modal */}
      <Dialog
        open={Boolean(selectedMeetingDetail)}
        onOpenChange={(open) => !open && setSelectedMeetingDetail(null)}
      >
        <DialogContent className="bg-card border-border max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {selectedMeetingDetail?.meeting?.topic}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Date: {selectedMeetingDetail?.meeting?.meeting_date} • Update attendance status or notes below if needed
            </p>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> Present: {editModalCounts.present}
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">
                <Clock className="w-3.5 h-3.5" /> Excused: {editModalCounts.excused}
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-medium border border-rose-200">
                <XCircle className="w-3.5 h-3.5" /> Absent: {editModalCounts.absent}
              </span>
            </div>

            <Input
              placeholder="Search tutor..."
              value={editModalSearch}
              onChange={(e) => setEditModalSearch(e.target.value)}
              className="h-8 text-xs w-44"
            />
          </div>

          <div className="overflow-y-auto border border-border rounded-xl flex-1">
            <table className="w-full text-xs">
              <thead className="bg-secondary/60 text-muted-foreground sticky top-0">
                <tr className="text-left">
                  <th className="px-3 py-2.5 w-10">#</th>
                  <th className="px-3 py-2.5">Tutor Name</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {editFilteredRecords.map((rec, i) => {
                  const currentEdit = editAttendanceMap[rec.id] || {
                    status: normalizeAttendanceStatus(rec.status),
                    notes: rec.notes || '',
                  };
                  return (
                    <tr key={rec.id} className="hover:bg-secondary/20">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                        {rec.tutor_name}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="inline-flex rounded-lg border border-border p-0.5 bg-secondary/40">
                          {['Present', 'Excused', 'Absent'].map((opt) => {
                            const active = currentEdit.status === opt;
                            let cls = 'text-muted-foreground hover:text-foreground';
                            if (active) {
                              if (opt === 'Present') cls = 'bg-emerald-600 text-white';
                              if (opt === 'Excused') cls = 'bg-amber-500 text-white';
                              if (opt === 'Absent') cls = 'bg-rose-600 text-white';
                            }
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleEditStatusChange(rec.id, opt)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition ${cls}`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={currentEdit.notes}
                          onChange={(e) => handleEditNotesChange(rec.id, e.target.value)}
                          placeholder={currentEdit.status === 'Excused' ? 'Reason...' : 'Note...'}
                          className="h-7 text-xs"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedMeetingDetail(null)}
            >
              Close
            </Button>
            <Button
              type="button"
              disabled={savingEdit}
              onClick={handleSaveEditedAttendance}
              className="bg-primary hover:bg-primary/90 gap-2"
            >
              {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}