import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { useAppAuth } from '@/lib/AppAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Download, Upload, FileSpreadsheet, Loader2, Pencil, Trash2, Check, Filter } from 'lucide-react';
import { toast } from 'sonner';

import AssignmentFormDialog from '@/components/weekly-feedback/AssignmentFormDialog';
import ImportWeeklyFeedbackDialog from '@/components/weekly-feedback/ImportWeeklyFeedbackDialog';
import WeeklyFeedbackStats from '@/components/weekly-feedback/WeeklyFeedbackStats';
import ExportDialog from '@/components/export/ExportDialog';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
import Pagination from '@/components/ui/pagination';
import { assignmentStatus, fmtDate, FEEDBACK_STATUS_META, weekBounds } from '@/lib/workflowUtils';

const ITEMS_PER_PAGE = 12;

const classKeyOf = (item) => item.class_name || item.class_code || item.student_name || '';

export default function WeeklyFeedback() {
  const { currentUser, hasPermission } = useAppAuth();
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [tutors, setTutors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [week, setWeek] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [tutor, setTutor] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);

  const canManage = hasPermission('weekly_feedback');

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: assignmentsData, error: assignErr } = await supabase
        .from('WeeklyFeedbackAssignment')
        .select('*')
        .order('created_date', { ascending: false });

      if (assignErr) {
        console.warn('WeeklyFeedbackAssignment fetch warning:', assignErr.message);
      }

      const { data: userData } = await supabase
        .from('CustomUser')
        .select('*');

      const { data: recordsData } = await supabase
        .from('FeedbackRecord')
        .select('class_code, class_name, week_start_date');

      const fetchedAssignments = assignmentsData || [];
      const fetchedUsers = userData || [];
      const fetchedRecords = recordsData || [];

      const updatedAssignments = fetchedAssignments.map((assignment) => {
        if (assignment.status === 'completed' || assignment.status === 'rescheduled') return assignment;

        const filledCount = fetchedRecords.filter(
          (r) => r.class_name === assignment.class_name || r.class_code === assignment.class_code
        ).length;

        const targetCount = assignment.student_count || 1;

        if (filledCount >= targetCount && filledCount > 0) {
          const nowIso = new Date().toISOString();
          supabase
            .from('WeeklyFeedbackAssignment')
            .update({
              status: 'completed',
              is_done: true,
              completed_at: nowIso,
              completed_date: nowIso,
              updated_date: nowIso,
            })
            .eq('id', assignment.id)
            .then();

          return { ...assignment, status: 'completed', is_done: true };
        }
        return assignment;
      });

      setItems(updatedAssignments);

      const uniqueClassesList = [...new Set(updatedAssignments.map(classKeyOf).filter(Boolean))];
      const uniqueCoursesList = [...new Set(updatedAssignments.map((i) => i.course_name).filter(Boolean))];

      setClasses(uniqueClassesList);
      setCourses(uniqueCoursesList);
      setTutors(fetchedUsers.filter((u) => ['Tutor', 'Team Leader'].includes(u.role) && u.is_active !== false));
    } catch (err) {
      console.error('Error loading weekly feedback:', err);
      toast.error('Could not load weekly feedback', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.id) loadAll();
  }, [currentUser?.id]);

  const weeks = [...new Set(items.map((i) => i.week_start_date?.slice(0, 10)).filter(Boolean))].sort().reverse();
  const usedClasses = [...new Set(items.map(classKeyOf).filter(Boolean))].sort();

  const filtered = items.filter((item) => {
    if (week !== 'all' && item.week_start_date?.slice(0, 10) !== week) return false;
    if (classFilter !== 'all' && classKeyOf(item) !== classFilter) return false;
    if (tutor !== 'all' && item.tutor_id !== tutor) return false;
    if (status !== 'all' && assignmentStatus(item) !== status) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const haystack = `${item.class_name || ''} ${item.class_code || ''} ${item.course_name || ''} ${item.tutor_name || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  useEffect(() => {
    setPage(1);
  }, [search, week, classFilter, tutor, status]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const markComplete = async (item) => {
    setBusyId(item.id);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('WeeklyFeedbackAssignment')
        .update({
          status: 'completed',
          is_done: true,
          completed_by_name: currentUser?.full_name || currentUser?.email || 'Tutor',
          completed_at: nowIso,
          completed_date: nowIso,
          updated_date: nowIso,
        })
        .eq('id', item.id);

      if (error) throw error;
      toast.success('Marked as completed');
      loadAll();
    } catch (err) {
      toast.error('Could not update status', { description: err.message });
    } finally {
      setBusyId('');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { data, error } = await supabase
        .from('WeeklyFeedbackAssignment')
        .delete()
        .eq('id', deleteTarget)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error('Blocked by Supabase RLS policy', {
          description: 'Please enable DELETE policy on WeeklyFeedbackAssignment in Supabase SQL Editor.',
        });
        return;
      }

      setItems((prev) => prev.filter((item) => item.id !== deleteTarget));
      toast.success('Assignment deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.error('Could not delete', { description: err.message });
    }
  };

  const downloadTemplate = () => {
    setTemplateLoading(true);
    try {
      const sampleData = [
        {
          'Class Code': 'MY 1-1 VP 020',
          'Course Name': 'Visual Programming',
          'Tutor Name': currentUser?.full_name || 'Putri Nadia Ayu',
          'Tutor ID': currentUser?.id || 'tutor_01',
          'Student Count': 1,
          'Week Start': '2026-11-09',
          'Week End': '2026-11-15',
          Status: 'Pending',
          Notes: 'Sample note',
        },
      ];

      const worksheet = XLSX.utils.json_to_sheet(sampleData);
      worksheet['!cols'] = [
        { wch: 18 },
        { wch: 24 },
        { wch: 22 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 12 },
        { wch: 28 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Weekly Feedback Template');

      XLSX.writeFile(workbook, 'Weekly_Student_Feedback_Template.xlsx');
      toast.success('Template downloaded successfully');
    } catch (err) {
      console.error('Download template error:', err);
      toast.error('Could not build template', { description: err.message });
    } finally {
      setTemplateLoading(false);
    }
  };

  const currentWeek = weekBounds();
  const exportFilters = {
    week,
    tutor_id: tutor,
    status,
    search,
  };

  const anyFilter = search || week !== 'all' || classFilter !== 'all' || tutor !== 'all' || status !== 'all';

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Weekly Student Feedback</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Current week: {fmtDate(currentWeek.start)} – {fmtDate(currentWeek.end)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate} disabled={templateLoading} className="border-border gap-2">
            {templateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Template
          </Button>
          {canManage && (
            <Button variant="outline" onClick={() => setImportOpen(true)} className="border-border gap-2">
              <Upload className="w-4 h-4" /> Import Excel
            </Button>
          )}
          <Button variant="outline" onClick={() => setExportOpen(true)} className="border-border gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </Button>
          {canManage && (
            <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 gap-2">
              <Plus className="w-4 h-4" /> Add Assignment
            </Button>
          )}
        </div>
      </div>

      <WeeklyFeedbackStats items={filtered} />

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search class, course or tutor..." className="pl-9" />
          </div>
          <Select value={week} onValueChange={setWeek}>
            <SelectTrigger className="lg:w-48"><SelectValue placeholder="Week" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All weeks</SelectItem>
              {weeks.map((w) => <SelectItem key={w} value={w}>Week of {fmtDate(w)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="lg:w-48"><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {usedClasses.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tutor} onValueChange={setTutor}>
            <SelectTrigger className="lg:w-44"><SelectValue placeholder="Tutor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tutors</SelectItem>
              {tutors.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name || t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="lg:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="rescheduled">Rescheduled</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="w-3 h-3" />
          <span>{filtered.length} of {items.length} assignments</span>
          {anyFilter && (
            <Button size="sm" variant="ghost" onClick={() => { setSearch(''); setWeek('all'); setClassFilter('all'); setTutor('all'); setStatus('all'); }} className="h-6 px-2">Clear all</Button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-14"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : paginated.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-muted-foreground text-sm">No assignments match this view.</p>
            {canManage && <p className="text-xs text-muted-foreground mt-1">Add an assignment or import an Excel file to get started.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Week</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Tutor</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((item) => {
                  const st = assignmentStatus(item);
                  const meta = FEEDBACK_STATUS_META[st] || { label: st, className: 'bg-muted text-muted-foreground' };
                  return (
                    <tr key={item.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {fmtDate(item.week_start_date)}<div className="text-[10px]">to {fmtDate(item.week_end_date)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{item.class_name || item.student_name || '—'}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {[item.class_code, item.course_name].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground">{item.tutor_name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-medium ${meta.className}`}>{meta.label}</span>
                        {(st === 'completed' || st === 'rescheduled') && item.completed_by_name && (
                          <div className="text-[10px] text-muted-foreground mt-1">by {item.completed_by_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[220px] truncate" title={item.notes || ''}>{item.notes || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {st !== 'completed' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => markComplete(item)}
                              disabled={busyId === item.id}
                              className="w-8 h-8 text-chart-3 hover:bg-chart-3/10"
                              title="Mark completed"
                            >
                              {busyId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </Button>
                          )}
                          {canManage && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => { setEditing(item); setFormOpen(true); }}
                                className="w-8 h-8 text-muted-foreground hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setDeleteTarget(item.id)}
                                className="w-8 h-8 text-destructive hover:bg-destructive/10"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}

      <AssignmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        classes={classes}
        tutors={tutors}
        courses={courses}
        onSaved={loadAll}
      />
      <ImportWeeklyFeedbackDialog open={importOpen} onOpenChange={setImportOpen} onImported={loadAll} />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultModule="weekly_feedback"
        modules={[
          { value: 'weekly_feedback', label: 'Weekly Class Feedback', hint: 'Class assignments, statuses and completion' },
          { value: 'student_feedback', label: 'Student Feedback Records', hint: 'Recorded feedback with points' },
        ]}
        filters={exportFilters}
      />
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
        onDelete={confirmDelete}
        title="Delete assignment"
        description="This removes the assignment from the weekly feedback list. Historical feedback records are not affected."
      />
    </div>
  );
}