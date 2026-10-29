const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';

import { useAppAuth } from '@/lib/AppAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Star, Eye, Loader2, Search, Filter, FileSpreadsheet } from 'lucide-react';
import ExportDialog from '@/components/export/ExportDialog';
import { toast } from 'sonner';
import FeedbackFormDialog from '@/components/feedback/FeedbackFormDialog';
import FeedbackPDFPreview from '@/components/feedback/FeedbackPDFPreview';
import Pagination from '@/components/ui/Pagination';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';

export default function StudentFeedback() {
  const { currentUser, hasPermission } = useAppAuth();
  const [records, setRecords] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [perfCategories, setPerfCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [previewRecord, setPreviewRecord] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCourse, setFilterCourse] = useState('all');
  const [filterTutor, setFilterTutor] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterRecordMonth, setFilterRecordMonth] = useState('all');
  const [filterRecordYear, setFilterRecordYear] = useState('all');
  const [filterMyOnly, setFilterMyOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  const [deleteTarget, setDeleteTarget] = useState(null);
  const canDelete = hasPermission('student_feedback_delete');
  const showCreatorInfo = ['Head of Tutor', 'Head of Retention', 'QC Team'].includes(currentUser?.role);
  const isTeamLeader = currentUser?.role === 'Team Leader';

  // useEffect(() => { loadData(); }, []);
  useEffect(() => {if (currentUser?.id) {loadData();}}, [currentUser?.id]);

  const loadData = async () => {
    setLoading(true);
    const [recs, perfs] = await Promise.all([
      // Filter: Tutor hanya lihat feedback mereka sendiri, Admin/Head lihat semua
      (currentUser?.role === 'Tutor' || currentUser?.role === 'Feedback Team')
        ? db.entities.FeedbackRecord.filter({ tutor_id: currentUser.id }, '-created_date')
        : db.entities.FeedbackRecord.list('-created_date'),
      db.entities.StudentPerformanceCategory.list('order_index'),
    ]);
    setAllRecords(recs);
    setRecords(recs);
    setPerfCategories(perfs);
    setLoading(false);
  };

  // Apply search and filters
  useEffect(() => {
    let filtered = allRecords;

    // Search by student name or class code
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.student_name?.toLowerCase().includes(query) ||
        r.class_code?.toLowerCase().includes(query)
      );
    }

    // Filter by course
    if (filterCourse !== 'all') {
      filtered = filtered.filter(r => r.course_name === filterCourse);
    }

    // Filter by tutor
    if (filterTutor !== 'all') {
      filtered = filtered.filter(r => r.tutor_id === filterTutor);
    }

    // Filter by module month
    if (filterMonth !== 'all') {
      filtered = filtered.filter(r => String(r.month) === filterMonth);
    }

    // Filter by record month/year
    if (filterRecordMonth !== 'all') {
      filtered = filtered.filter(r => String(r.record_month) === filterRecordMonth);
    }
    if (filterRecordYear !== 'all') {
      filtered = filtered.filter(r => String(r.record_year) === filterRecordYear);
    }

    // Team Leader: filter to own feedback only
    if (filterMyOnly) {
      filtered = filtered.filter(r => r.tutor_id === currentUser.id);
    }

    setRecords(filtered);
    setCurrentPage(1);
  }, [searchQuery, filterCourse, filterTutor, filterMonth, filterRecordMonth, filterRecordYear, filterMyOnly, allRecords, currentUser]);

  // Calculate pagination
  const totalPages = Math.ceil(records.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedRecords = records.slice(startIndex, endIndex);

  // Get unique values for filters
  const uniqueCourses = [...new Set(allRecords.map(r => r.course_name).filter(Boolean))];
  const uniqueTutors = allRecords.filter(r => r.tutor_name && r.tutor_id)
    .reduce((acc, r) => {
      if (!acc.find(t => t.id === r.tutor_id)) {
        acc.push({ id: r.tutor_id, name: r.tutor_name });
      }
      return acc;
    }, []);
  const uniqueMonths = [...new Set(allRecords.map(r => r.month).filter(Boolean))];
  const uniqueRecordYears = [...new Set(allRecords.map(r => r.record_year).filter(Boolean))].sort((a,b) => b - a);
  const MONTHS_LABEL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // Decode "aspectId::pointNumber" -> { pointNum, description, aspect }
  const decodePerfValue = (val) => {
    if (!val || !val.includes('::')) return null;
    const parts = val.split('::');
    const aspectKey = parts[0];
    const pointNum = parseInt(parts[1]);
    const embeddedDesc = parts.slice(2).join('::');
    const aspect = perfCategories.find(p => p.aspect_title === aspectKey || p.id === aspectKey);
    if (!aspect) return null;
    const desc = embeddedDesc || aspect[`point_${pointNum}_description`] || '';
    return { pointNum, description: desc, aspect };
  };

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit = (r) => { setEditing(r); setOpen(true); };

  const handleDelete = async (id) => {
    if (!canDelete) {
      toast.error('Delete not allowed', { description: 'You do not have permission to delete feedback records.' });
      return;
    }
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    await db.entities.FeedbackRecord.delete(deleteTarget);
    setDeleteTarget(null);
    loadData();
    toast.success('Feedback deleted');
  };

  const handleSaved = () => {
    setOpen(false);
    loadData();
    toast.success(editing ? 'Feedback updated' : 'Feedback created');
  };

  const handlePreview = (r) => { setPreviewRecord(r); setPreviewOpen(true); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Student Feedback</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage student feedback records</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setExportOpen(true)} className="border-border gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </Button>
          <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 gap-2">
            <Plus className="w-4 h-4" /> Add Feedback
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by student name or class code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Module Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {uniqueMonths.map(m => (
                <SelectItem key={m} value={String(m)}>Month {m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Record date filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={filterRecordMonth} onValueChange={setFilterRecordMonth}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Record Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Record Months</SelectItem>
              {MONTHS_LABEL.map((m, i) => (
                <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterRecordYear} onValueChange={setFilterRecordYear}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="Record Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {uniqueRecordYears.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterCourse} onValueChange={setFilterCourse}>
            <SelectTrigger className="w-full sm:flex-1">
              <SelectValue placeholder="Course" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {uniqueCourses.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterTutor} onValueChange={setFilterTutor}>
            <SelectTrigger className="w-full sm:flex-1">
              <SelectValue placeholder="Tutor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tutors</SelectItem>
              {uniqueTutors.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isTeamLeader && (
          <Button
            variant={filterMyOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterMyOnly(v => !v)}
            className="gap-1.5 w-fit"
          >
            <Filter className="w-3.5 h-3.5" /> My Feedback Only
          </Button>
        )}
        {(searchQuery || filterCourse !== 'all' || filterTutor !== 'all' || filterMonth !== 'all' || filterRecordMonth !== 'all' || filterRecordYear !== 'all' || filterMyOnly) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="w-3 h-3" />
            <span>{records.length} of {allRecords.length} records shown</span>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => {
                setSearchQuery('');
                setFilterCourse('all');
                setFilterTutor('all');
                setFilterMonth('all');
                setFilterRecordMonth('all');
                setFilterRecordYear('all');
                setFilterMyOnly(false);
              }}
              className="h-6 px-2 hover:bg-muted"
            >
              Clear all
            </Button>
          </div>
        )}
        {records.length > 0 && (
          <div className="text-xs text-muted-foreground text-center">
            Showing {startIndex + 1} to {Math.min(endIndex, records.length)} of {records.length} records
          </div>
        )}
      </div>

      {/* Records Grid */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {paginatedRecords.map(r => (
              <RecordCard
                key={r.id}
                record={r}
                decodePerfValue={decodePerfValue}
                onEdit={() => openEdit(r)}
                onDelete={() => handleDelete(r.id)}
                onPreview={() => handlePreview(r)}
                canDelete={canDelete}
                showCreator={showCreatorInfo}
              />
            ))}
            {paginatedRecords.length === 0 && (
              <div className="col-span-3 bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
                No feedback records yet. Click "Add Feedback" to create one.
              </div>
            )}
          </div>
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultModule="student_feedback"
        modules={[
          { value: 'student_feedback', label: 'Student Feedback Records', hint: 'All pages, with points and tutor notes' },
          { value: 'weekly_feedback', label: 'Weekly Student Feedback', hint: 'Assignments, statuses and completion' },
        ]}
        filters={{
          tutor_id: filterTutor !== 'all' ? filterTutor : '',
          course: filterCourse !== 'all' ? filterCourse : '',
          record_month: filterRecordMonth !== 'all' ? filterRecordMonth : '',
          record_year: filterRecordYear !== 'all' ? filterRecordYear : '',
          search: searchQuery,
        }}
      />

      <FeedbackFormDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSaved={handleSaved}
      />

      <FeedbackPDFPreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        record={previewRecord}
        decodePerfValue={decodePerfValue}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
        title="Delete Feedback Record"
        description="Are you sure you want to delete this feedback record? This action cannot be undone."
      />
    </div>
  );
}

function RecordCard({ record: r, decodePerfValue, onEdit, onDelete, onPreview, canDelete, showCreator }) {
  const stars = r.point || 0;
  const isSafeProjectLink = /^https?:\/\//i.test((r.project_link || '').trim());

  const presDecoded = decodePerfValue(r.presence);
  const invDecoded = decodePerfValue(r.involvement_difficulty);
  const taskDecoded = decodePerfValue(r.task_completion);

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-foreground">{r.student_name || '—'}</div>
          <div className="text-xs text-muted-foreground">{r.tutor_name && `Tutor: ${r.tutor_name}`}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <span>Created by: {r.created_by_name || r.tutor_name || '—'}</span>
            {r.created_by_role && r.created_by_role !== 'Tutor' && (
              <span className="bg-accent/15 text-accent px-1.5 py-0.5 rounded-full text-[10px]">{r.created_by_role}</span>
            )}
          </div>
          {r.course_name && <div className="text-xs text-accent mt-0.5">{r.course_name}{r.month ? ` · Month ${r.month}` : ''}</div>}
          {r.class_code && <div className="text-xs text-muted-foreground">Class: {r.class_code}</div>}
          {r.record_date && <div className="text-xs text-muted-foreground">Date: {new Date(r.record_date).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}</div>}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit} className="w-7 h-7 p-0 hover:bg-primary/20 hover:text-primary">
            <Pencil className="w-3 h-3" />
          </Button>
          {canDelete && (
            <Button size="sm" variant="ghost" onClick={onDelete} className="w-7 h-7 p-0 hover:bg-destructive/20 hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Stars */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((s) => {
          const fill = Math.min(Math.max(stars - (s - 1), 0), 1);
          return (
            <div key={s} className="relative w-4 h-4">
              <Star className="w-4 h-4 text-border absolute inset-0" />
              <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              </div>
            </div>
          );
        })}
        <span className="text-xs text-muted-foreground ml-1">{stars}/5</span>
      </div>

      {/* Performance tags - decoded */}
      <div className="flex flex-wrap gap-1">
        {presDecoded && <Tag>Presence: Point {presDecoded.pointNum}</Tag>}
        {invDecoded && <Tag>Involvement: Point {invDecoded.pointNum}</Tag>}
        {taskDecoded && <Tag>Task: Point {taskDecoded.pointNum}</Tag>}
        {/* Fallback for old data format */}
        {!presDecoded && r.presence && <Tag>{r.presence}</Tag>}
        {!invDecoded && r.involvement_difficulty && <Tag>{r.involvement_difficulty}</Tag>}
        {!taskDecoded && r.task_completion && <Tag>{r.task_completion}</Tag>}
      </div>

      {/* Project link */}
      {r.project_link && (
        isSafeProjectLink ? (
          <a href={r.project_link} target="_blank" rel="noreferrer" className="text-xs text-accent underline break-all block">{r.project_link}</a>
        ) : (
          <span className="text-xs text-muted-foreground break-all block">{r.project_link}</span>
        )
      )}

      {/* Preview PDF */}
      <Button size="sm" variant="outline" onClick={onPreview} className="w-full gap-1.5 border-border text-xs h-8">
        <Eye className="w-3 h-3" /> Preview PDF
      </Button>
    </div>
  );
}

function Tag({ children }) {
  return <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{children}</span>;
}