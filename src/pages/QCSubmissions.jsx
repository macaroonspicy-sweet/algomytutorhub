import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAppAuth } from '@/lib/AppAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import Pagination from '@/components/ui/pagination';
import {
  Loader2,
  Search,
  ExternalLink,
  CheckCircle2,
  Clock,
  CheckSquare,
  Square,
  Pencil,
  Trash2,
  X,
  Save,
  Download,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';

const PER_PAGE = 10;

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const getMonthName = (monthNum) => {
  const found = MONTHS.find((m) => m.value === Number(monthNum));
  return found ? found.label : '—';
};

function StatCard({ label, value, icon: Icon, tone }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-xl font-bold text-foreground">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function QCSubmissions() {
  const { currentUser } = useAppAuth();
  const isTutorOnly = currentUser?.role === 'Tutor';

  const now = new Date();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    status: 'all',
    month: 'all',
    period: 'all',
    search: '',
  });

  // State for New Submission Modal (Tutor / manual)
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    period_month: now.getMonth() + 1,
    period_year: now.getFullYear(),
    period: 1,
    recording_url: '',
    notes: '',
  });

  // State for Edit Modal
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({
    tutor_name: '',
    period_month: now.getMonth() + 1,
    period_year: now.getFullYear(),
    period: 1,
    recording_url: '',
    notes: '',
    status: 'submitted',
  });

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('QCSubmission')
        .select('*')
        .order('created_date', { ascending: false });

      if (error) throw error;
      setSubmissions(data || []);
    } catch (err) {
      toast.error('Failed to load QC submissions', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  // Scope data: if Tutor, only show their own submissions
  const roleScopedSubmissions = useMemo(() => {
    if (!isTutorOnly) return submissions;
    const myId = currentUser?.id;
    const myName = (currentUser?.full_name || '').toLowerCase().trim();

    return submissions.filter((s) => {
      if (myId && s.tutor_id !== null && s.tutor_id !== undefined && String(s.tutor_id) === String(myId)) {
        return true;
      }
      if (myName && s.tutor_name && s.tutor_name.toLowerCase().trim() === myName) {
        return true;
      }
      return false;
    });
  }, [submissions, isTutorOnly, currentUser]);

  const handleCreateSubmit = async () => {
    if (!createForm.recording_url.trim()) {
      toast.error('Class recording link is required');
      return;
    }

    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const rawTutorId = currentUser?.id;
      const numericTutorId =
        rawTutorId !== null && rawTutorId !== undefined && /^\d+$/.test(String(rawTutorId))
          ? Number(rawTutorId)
          : null;

      const payload = {
        tutor_id: numericTutorId,
        tutor_name: currentUser?.full_name || 'Tutor',
        period_month: Number(createForm.period_month),
        period_year: Number(createForm.period_year),
        period: Number(createForm.period),
        recording_url: createForm.recording_url.trim(),
        notes: createForm.notes.trim(),
        status: 'submitted',
        submission_date: nowIso.slice(0, 10),
        created_date: nowIso,
        updated_date: nowIso,
      };

      const { error } = await supabase.from('QCSubmission').insert([payload]);
      if (error) throw error;

      toast.success('QC recording link submitted successfully!');
      setCreateOpen(false);
      setCreateForm({
        period_month: now.getMonth() + 1,
        period_year: now.getFullYear(),
        period: 1,
        recording_url: '',
        notes: '',
      });
      loadSubmissions();
    } catch (err) {
      toast.error('Failed to submit recording', { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEvaluatedStatus = async (item) => {
    if (isTutorOnly) return;
    const newStatus =
      item.status === 'evaluated'
        ? item.recording_url
          ? 'submitted'
          : 'pending'
        : 'evaluated';

    try {
      const { error } = await supabase
        .from('QCSubmission')
        .update({ status: newStatus, updated_date: new Date().toISOString() })
        .eq('id', item.id);

      if (error) throw error;
      toast.success(`Status updated to: ${newStatus}`);
      loadSubmissions();
    } catch (err) {
      toast.error('Failed to update status', { description: err.message });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this submission?')) return;
    try {
      const { error } = await supabase.from('QCSubmission').delete().eq('id', id);

      if (error) throw error;
      toast.success('Submission deleted successfully');
      loadSubmissions();
    } catch (err) {
      toast.error('Failed to delete submission', { description: err.message });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    try {
      const updatePayload = {
        period_month: Number(editForm.period_month),
        period_year: Number(editForm.period_year),
        period: Number(editForm.period),
        recording_url: editForm.recording_url,
        notes: editForm.notes,
        updated_date: new Date().toISOString(),
      };

      if (!isTutorOnly) {
        updatePayload.tutor_name = editForm.tutor_name;
        updatePayload.status = editForm.status;
      }

      const { error } = await supabase
        .from('QCSubmission')
        .update(updatePayload)
        .eq('id', editingItem.id);

      if (error) throw error;
      toast.success('Submission updated successfully');
      setEditingItem(null);
      loadSubmissions();
    } catch (err) {
      toast.error('Failed to update submission', { description: err.message });
    }
  };

  const set = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const filtered = roleScopedSubmissions.filter((s) => {
    const normalizedStatus = s.status || 'pending';
    const matchStatus =
      filters.status === 'all' || normalizedStatus === filters.status;
    const matchMonth =
      filters.month === 'all' || Number(s.period_month) === Number(filters.month);
    const matchPeriod =
      filters.period === 'all' || Number(s.period) === Number(filters.period);

    if (!matchStatus || !matchMonth || !matchPeriod) return false;

    if (!filters.search.trim()) return true;
    const q = filters.search.toLowerCase();
    return (
      (s.tutor_name && s.tutor_name.toLowerCase().includes(q)) ||
      (s.notes && s.notes.toLowerCase().includes(q))
    );
  });

  const handleExportExcel = async () => {
    if (filtered.length === 0) {
      toast.error('No data available to export');
      return;
    }

    try {
      const XLSX = await import('xlsx');

      const exportRows = filtered.map((s, idx) => ({
        No: idx + 1,
        Tutor: s.tutor_name || '-',
        Month: s.period_month ? getMonthName(s.period_month) : '-',
        Year: s.period_year || '-',
        Period: s.period ? `Period ${s.period}` : '-',
        'Notes / Class Info': s.notes || '-',
        Status:
          s.status === 'evaluated'
            ? 'Evaluated'
            : s.status === 'submitted'
            ? 'Submitted'
            : 'Pending',
        'Recording Link': s.recording_url || '-',
        'Submission Date': s.submission_date || '-',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      worksheet['!cols'] = [
        { wch: 5 },
        { wch: 24 },
        { wch: 14 },
        { wch: 8 },
        { wch: 14 },
        { wch: 30 },
        { wch: 14 },
        { wch: 42 },
        { wch: 15 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'QC Submissions');

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `QC_Submissions_${dateStr}.xlsx`);
      toast.success('Excel file downloaded successfully');
    } catch (err) {
      toast.error('Failed to export Excel', { description: err.message });
    }
  };

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const summary = {
    total: roleScopedSubmissions.length,
    evaluated: roleScopedSubmissions.filter((s) => s.status === 'evaluated').length,
    submitted: roleScopedSubmissions.filter((s) => s.status === 'submitted').length,
    pending: roleScopedSubmissions.filter((s) => s.status === 'pending' || !s.status).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {isTutorOnly ? 'My QC Submissions' : 'QC Submissions'}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isTutorOnly
              ? 'History of class recording links you have submitted for QC evaluation.'
              : 'List of class recording links submitted by tutors for evaluation.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start lg:self-auto">
          {isTutorOnly && (
            <Button
              onClick={() => setCreateOpen(true)}
              className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Plus className="w-4 h-4" />
              Submit Recording
            </Button>
          )}
          {!isTutorOnly && (
            <Button
              onClick={handleExportExcel}
              disabled={loading || filtered.length === 0}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Download className="w-4 h-4" />
              Export Excel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        <StatCard label="Total Submissions" value={summary.total} icon={CheckCircle2} tone="bg-chart-3/70" />
        <StatCard label="Evaluated" value={summary.evaluated} icon={CheckSquare} tone="bg-emerald-600/70" />
        <StatCard label="Submitted" value={summary.submitted} icon={Clock} tone="bg-primary/70" />
        <StatCard label="Pending (Not Sent)" value={summary.pending} icon={Clock} tone="bg-amber-600/70" />
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(e) => set('search', e.target.value)}
              placeholder={isTutorOnly ? 'Search notes or details...' : 'Search tutor name or notes...'}
              className="pl-9"
            />
          </div>
          <Select value={filters.month} onValueChange={(v) => set('month', v)}>
            <SelectTrigger className="lg:w-40"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.period} onValueChange={(v) => set('period', v)}>
            <SelectTrigger className="lg:w-40"><SelectValue placeholder="Period" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Periods</SelectItem>
              <SelectItem value="1">Period 1</SelectItem>
              <SelectItem value="2">Period 2</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(v) => set('status', v)}>
            <SelectTrigger className="lg:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="evaluated">Evaluated</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground">
          Showing {filtered.length} records
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Submission Links List</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : paginated.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No submissions found yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-left text-xs text-muted-foreground">
                  {!isTutorOnly && (
                    <th className="px-4 py-3 font-medium w-12 text-center">Evaluation Status</th>
                  )}
                  <th className="px-4 py-3 font-medium">Tutor</th>
                  <th className="px-4 py-3 font-medium">Month & Period</th>
                  <th className="px-4 py-3 font-medium">Notes / Details</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Recording Link</th>
                  <th className="px-4 py-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((s) => {
                  const canTutorEdit = !isTutorOnly || s.status !== 'evaluated';
                  return (
                    <tr key={s.id || s.created_date} className="hover:bg-secondary/30 transition-colors">
                      {!isTutorOnly && (
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleEvaluatedStatus(s)}
                            title="Click to toggle Evaluated status"
                            className="p-1 rounded hover:bg-secondary transition-colors inline-flex items-center justify-center text-primary"
                          >
                            {s.status === 'evaluated' ? (
                              <CheckSquare className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <Square className="w-5 h-5 text-muted-foreground" />
                            )}
                          </button>
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium text-foreground">{s.tutor_name || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-foreground">
                          {s.period_month ? `${getMonthName(s.period_month)} ${s.period_year || ''}` : '—'}
                        </div>
                        <div className="text-[11px] text-primary">
                          {s.period ? `Period ${s.period}` : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[250px] truncate">
                        {s.notes || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            s.status === 'evaluated'
                              ? 'border-emerald-500/40 text-emerald-500 text-[10px]'
                              : s.status === 'submitted'
                              ? 'border-primary/40 text-primary text-[10px]'
                              : 'border-amber-500/40 text-amber-500 text-[10px]'
                          }
                        >
                          {s.status === 'evaluated'
                            ? 'Evaluated'
                            : s.status === 'submitted'
                            ? 'Submitted'
                            : 'Pending'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.recording_url ? (
                          <a
                            href={s.recording_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-medium"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Open Link
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {canTutorEdit ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setEditingItem(s);
                                setEditForm({
                                  tutor_name: s.tutor_name || '',
                                  period_month: s.period_month || now.getMonth() + 1,
                                  period_year: s.period_year || now.getFullYear(),
                                  period: s.period || 1,
                                  recording_url: s.recording_url || '',
                                  notes: s.notes || '',
                                  status: s.status || 'submitted',
                                });
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Locked</span>
                          )}
                          {!isTutorOnly && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive/80"
                              onClick={() => handleDelete(s.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
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

      {/* New Submission Modal (Tutor) */}
      {createOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">Submit QC Recording</h3>
              <Button size="icon" variant="ghost" onClick={() => setCreateOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Month</label>
                  <Select
                    value={String(createForm.period_month)}
                    onValueChange={(v) => setCreateForm({ ...createForm, period_month: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Year</label>
                  <Input
                    type="number"
                    value={createForm.period_year}
                    onChange={(e) => setCreateForm({ ...createForm, period_year: Number(e.target.value) })}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Period</label>
                  <Select
                    value={String(createForm.period)}
                    onValueChange={(v) => setCreateForm({ ...createForm, period: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Period 1</SelectItem>
                      <SelectItem value="2">Period 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Recording URL / Drive Link</label>
                <Input
                  placeholder="https://drive.google.com/..."
                  value={createForm.recording_url}
                  onChange={(e) => setCreateForm({ ...createForm, recording_url: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes / Class Name</label>
                <Input
                  placeholder="-"
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateSubmit} disabled={submitting} className="gap-1.5">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Recording
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">Edit QC Submission</h3>
              <Button size="icon" variant="ghost" onClick={() => setEditingItem(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-3">
              {!isTutorOnly && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tutor Name</label>
                  <Input
                    value={editForm.tutor_name}
                    onChange={(e) => setEditForm({ ...editForm, tutor_name: e.target.value })}
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Month</label>
                  <Select
                    value={String(editForm.period_month)}
                    onValueChange={(v) => setEditForm({ ...editForm, period_month: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Year</label>
                  <Input
                    type="number"
                    value={editForm.period_year}
                    onChange={(e) => setEditForm({ ...editForm, period_year: Number(e.target.value) })}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Period</label>
                  <Select
                    value={String(editForm.period)}
                    onValueChange={(v) => setEditForm({ ...editForm, period: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Period 1</SelectItem>
                      <SelectItem value="2">Period 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Recording URL / Playlist</label>
                <Input
                  value={editForm.recording_url}
                  onChange={(e) => setEditForm({ ...editForm, recording_url: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                <Input
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </div>
              {!isTutorOnly && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="evaluated">Evaluated</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
              <Button onClick={handleSaveEdit} className="gap-1.5">
                <Save className="w-4 h-4" /> Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}