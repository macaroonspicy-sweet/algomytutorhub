const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';

import { useAppAuth } from '@/lib/AppAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Filter, X, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import { generateQCEvaluationPDF } from '@/lib/pdfGenerator';
import QCRecordCard from '@/components/qc/QCRecordCard';
import QCEvalFormDialog from '@/components/qc/QCEvalFormDialog';
import TelegramSendDialog from '@/components/qc/TelegramSendDialog';
import { toast } from 'sonner';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const GRADES = ['Excellent', 'Good', 'Fair', 'Needs Improvement', 'Critical'];

export default function QCTutor() {
  const { hasPermission, currentUser } = useAppAuth();
  const canDelete = hasPermission('qc_records_delete');
  const isTeamLeader = currentUser?.role === 'Team Leader';
  const [records, setRecords] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [tutors, setTutors] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sendingTg, setSendingTg] = useState({});
  const [search, setSearch] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterMyOnly, setFilterMyOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [tgTarget, setTgTarget] = useState(null);
  const ITEMS_PER_PAGE = 10; // 10 data per halaman

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [recs, users] = await Promise.all([
      db.entities.QCRecord.list('-created_date'),
      db.entities.CustomUser.list(),
    ]);

    // Sorting Descending untuk memastikan data terbaru selalu berada di posisi pertama
    const sortedRecs = [...(recs || [])].sort((a, b) => new Date(b.created_date || b.record_date || 0) - new Date(a.created_date || a.record_date || 0));

    setRecords(sortedRecs);
    setAdmins(users.filter(u => u.role !== 'Tutor'));
    setTutors(users.filter(u => u.role === 'Tutor' || u.role === 'Team Leader'));
  };

  const handleDelete = (id) => {
    if (!canDelete) {
      toast.error('Delete not allowed', { description: 'You do not have permission to delete QC records.' });
      return;
    }
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    await db.entities.QCRecord.delete(deleteTarget);
    setDeleteTarget(null);
    loadData();
    toast.success('QC record deleted', { description: 'The QC record has been removed.' });
  };

  const handleDownloadPDF = async (record) => {
    const aspects = await db.entities.QCEvaluationAspect.list('order_index');
    await generateQCEvaluationPDF(record, aspects);
  };

  const handleSendTelegram = (record) => {
    if (!record.tutor_telegram) { toast.error('Tutor has no Telegram account saved.'); return; }
    if (!currentUser?.telegram_bot_token) {
      toast.error('No Telegram Bot Token', { description: 'Please set your Telegram Bot Token in My Profile before sending.' });
      return;
    }
    setTgTarget(record);
  };

  const years = [...new Set(records.map(r => r.period_year))].filter(Boolean).sort((a,b) => b-a);
  const hasFilters = search || filterPeriod !== 'all' || filterMonth !== 'all' || filterYear !== 'all' || filterGrade !== 'all' || filterMyOnly;
  
  const filtered = records
    .filter(r => {
      const matchSearch = !search || r.tutor_name?.toLowerCase().includes(search.toLowerCase()) || r.admin_qc_name?.toLowerCase().includes(search.toLowerCase());
      const matchPeriod = filterPeriod === 'all' || String(r.period) === filterPeriod;
      const matchMonth = filterMonth === 'all' || String(r.period_month) === filterMonth;
      const matchYear = filterYear === 'all' || String(r.period_year) === filterYear;
      const matchGrade = filterGrade === 'all' || r.final_grade === filterGrade;
      const matchMyOnly = !filterMyOnly || r.tutor_id === currentUser.id;
      return matchSearch && matchPeriod && matchMonth && matchYear && matchGrade && matchMyOnly;
    })
    .sort((a, b) => new Date(b.created_date || b.record_date || 0) - new Date(a.created_date || a.record_date || 0));

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedFiltered = filtered.slice(startIndex, endIndex);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, filterPeriod, filterMonth, filterYear, filterGrade, filterMyOnly]);

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">QC Tutor Records</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Quality control evaluations with per-aspect scoring</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-primary hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> Add QC Record
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by tutor or admin QC..." className="pl-9 bg-muted border-border" />
        </div>
        <Select value={filterPeriod} onValueChange={setFilterPeriod}>
          <SelectTrigger className="w-32 bg-muted border-border"><SelectValue placeholder="Period" /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Periods</SelectItem>
            <SelectItem value="1">Period 1</SelectItem>
            <SelectItem value="2">Period 2</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-36 bg-muted border-border"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Months</SelectItem>
            {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-28 bg-muted border-border"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Years</SelectItem>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterGrade} onValueChange={setFilterGrade}>
          <SelectTrigger className="w-40 bg-muted border-border"><SelectValue placeholder="Grade" /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Grades</SelectItem>
            {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        {isTeamLeader && (
          <Button
            variant={filterMyOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterMyOnly(v => !v)}
            className="gap-1.5"
          >
            <Filter className="w-3.5 h-3.5" /> My QC Only
          </Button>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilterPeriod('all'); setFilterMonth('all'); setFilterYear('all'); setFilterGrade('all'); setFilterMyOnly(false); }} className="text-muted-foreground gap-1.5">
            <X className="w-3.5 h-3.5" /> Clear
          </Button>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="text-xs text-muted-foreground text-center">
          Showing {startIndex + 1} to {Math.min(endIndex, filtered.length)} of {filtered.length} records
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {paginatedFiltered.map(r => (
          <QCRecordCard
            key={r.id || r.created_date}
            record={r}
            onEdit={(r) => { setEditing(r); setOpen(true); }}
            onDelete={handleDelete}
            onDownloadPDF={handleDownloadPDF}
            onSendTelegram={handleSendTelegram}
            sendingTg={!!sendingTg[r.id]}
            canDelete={canDelete}
          />
        ))}
        {paginatedFiltered.length === 0 && (
          <div className="col-span-3 bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
            No QC records yet. Click "Add QC Record" to get started.
          </div>
        )}
      </div>

      {/* PURPLE STYLED PAGINATION UI */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-6">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="w-9 h-9 rounded-xl border-border bg-card hover:bg-secondary disabled:opacity-30"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="w-9 h-9 rounded-xl border-border bg-card hover:bg-secondary disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {getPageNumbers().map((page, idx) => {
            if (page === '...') {
              return (
                <span key={`dots-${idx}`} className="px-2 text-sm text-muted-foreground select-none">
                  ...
                </span>
              );
            }
            const isActive = page === currentPage;
            return (
              <Button
                key={page}
                variant={isActive ? 'default' : 'outline'}
                onClick={() => setCurrentPage(page)}
                className={`w-9 h-9 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-600 hover:bg-purple-700 text-white font-semibold border-purple-600 shadow-md shadow-purple-900/30'
                    : 'border-border bg-card hover:bg-secondary text-foreground/80'
                }`}
              >
                {page}
              </Button>
            );
          })}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="w-9 h-9 rounded-xl border-border bg-card hover:bg-secondary disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className="w-9 h-9 rounded-xl border-border bg-card hover:bg-secondary disabled:opacity-30"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <QCEvalFormDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        admins={admins}
        tutors={tutors}
        onSaved={loadData}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
        title="Delete QC Record"
        description="Are you sure you want to delete this QC record? This action cannot be undone."
      />

      <TelegramSendDialog
        open={!!tgTarget}
        onOpenChange={(v) => { if (!v) setTgTarget(null); }}
        record={tgTarget}
        botToken={currentUser?.telegram_bot_token || ''}
        onSendingChange={(s) => { if (tgTarget) setSendingTg(prev => ({ ...prev, [tgTarget.id]: s })); }}
      />
    </div>
  );
}