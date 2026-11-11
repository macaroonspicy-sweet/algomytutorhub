import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import Pagination from '@/components/ui/pagination';
import { 
  Loader2, Search, ExternalLink, CheckCircle2, Clock, 
  CheckSquare, Square, Pencil, Trash2, X, Save 
} from 'lucide-react';
import { toast } from 'sonner';

const PER_PAGE = 10;

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
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: 'all', search: '' });

  // State for Edit Modal
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ tutor_name: '', recording_url: '', notes: '', status: 'submitted' });

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('QCSubmission')
        .select('*')
        .order('created_date', { ascending: false });

      if (filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSubmissions(data || []);
    } catch (err) {
      toast.error('Gagal memuat QC submissions', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, [filters.status]);

  // Toggle status antara 'evaluated' dan 'submitted' (atau status sebelumnya)
  const toggleEvaluatedStatus = async (item) => {
    // Jika saat ini sudah evaluated, kembalikan ke submitted (atau pending jika ada recording_url kosong).
    // Jika belum evaluated, ubah jadi evaluated.
    const newStatus = item.status === 'evaluated' 
      ? (item.recording_url ? 'submitted' : 'pending') 
      : 'evaluated';

    try {
      const { error } = await supabase
        .from('QCSubmission')
        .update({ status: newStatus, updated_date: new Date().toISOString() })
        .eq('id', item.id);

      if (error) throw error;
      toast.success(`Status berhasil diubah menjadi: ${newStatus}`);
      loadSubmissions();
    } catch (err) {
      toast.error('Gagal mengubah status', { description: err.message });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Apakah kamu yakin ingin menghapus submission ini?')) return;
    try {
      const { error } = await supabase
        .from('QCSubmission')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Submission berhasil dihapus');
      loadSubmissions();
    } catch (err) {
      toast.error('Gagal menghapus', { description: err.message });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    try {
      const { error } = await supabase
        .from('QCSubmission')
        .update({
          tutor_name: editForm.tutor_name,
          recording_url: editForm.recording_url,
          notes: editForm.notes,
          status: editForm.status,
          updated_date: new Date().toISOString()
        })
        .eq('id', editingItem.id);

      if (error) throw error;
      toast.success('Submission berhasil diperbarui');
      setEditingItem(null);
      loadSubmissions();
    } catch (err) {
      toast.error('Gagal memperbarui', { description: err.message });
    }
  };

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const filtered = submissions.filter((s) => {
    if (!filters.search.trim()) return true;
    const q = filters.search.toLowerCase();
    return (
      (s.tutor_name && s.tutor_name.toLowerCase().includes(q)) ||
      (s.notes && s.notes.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const summary = {
    total: submissions.length,
    evaluated: submissions.filter(s => s.status === 'evaluated').length,
    submitted: submissions.filter(s => s.status === 'submitted').length,
    pending: submissions.filter(s => s.status === 'pending' || !s.status).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">QC Submissions</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Daftar link rekaman kelas yang dikirimkan oleh tutor untuk dinilai.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        <StatCard label="Total Submissions" value={summary.total} icon={CheckCircle2} tone="bg-chart-3/70" />
        <StatCard label="Sudah Dinilai (Evaluated)" value={summary.evaluated} icon={CheckSquare} tone="bg-emerald-600/70" />
        <StatCard label="Submitted (Tutor Kirim)" value={summary.submitted} icon={Clock} tone="bg-primary/70" />
        <StatCard label="Pending (Belum Kirim)" value={summary.pending} icon={Clock} tone="bg-amber-600/70" />
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={filters.search} onChange={(e) => set('search', e.target.value)} placeholder="Cari nama tutor atau catatan..." className="pl-9" />
          </div>
          <Select value={filters.status} onValueChange={(v) => set('status', v)}>
            <SelectTrigger className="lg:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="evaluated">Evaluated</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground">
          Menampilkan {filtered.length} data
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Daftar Link Submissions</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : paginated.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Belum ada submission ditemukan.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium w-12 text-center">Status Nilai</th>
                  <th className="px-4 py-3 font-medium">Tutor</th>
                  <th className="px-4 py-3 font-medium">Catatan / Keterangan</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Recording Link</th>
                  <th className="px-4 py-3 font-medium text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((s) => (
                  <tr key={s.id || s.created_date} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={() => toggleEvaluatedStatus(s)}
                        title="Klik untuk centang sudah dinilai (Evaluated)"
                        className="p-1 rounded hover:bg-secondary transition-colors inline-flex items-center justify-center text-primary"
                      >
                        {s.status === 'evaluated' ? (
                          <CheckSquare className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <Square className="w-5 h-5 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{s.tutor_name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[250px] truncate">
                      {s.notes || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={
                        s.status === 'evaluated' 
                          ? 'border-emerald-500/40 text-emerald-400 text-[10px]' 
                          : s.status === 'submitted'
                          ? 'border-primary/40 text-primary text-[10px]'
                          : 'border-amber-500/40 text-amber-400 text-[10px]'
                      }>
                        {s.status === 'evaluated' ? 'Evaluated' : (s.status === 'submitted' ? 'Submitted' : 'Pending')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.recording_url ? (
                        <a href={s.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-medium">
                          <ExternalLink className="w-3.5 h-3.5" /> Buka Link
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingItem(s);
                            setEditForm({
                              tutor_name: s.tutor_name || '',
                              recording_url: s.recording_url || '',
                              notes: s.notes || '',
                              status: s.status || 'submitted'
                            });
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-destructive hover:text-destructive/80"
                          onClick={() => handleDelete(s.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}

      {/* Modal Edit */}
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
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nama Tutor</label>
                <Input 
                  value={editForm.tutor_name} 
                  onChange={(e) => setEditForm({ ...editForm, tutor_name: e.target.value })} 
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Recording URL / Playlist</label>
                <Input 
                  value={editForm.recording_url} 
                  onChange={(e) => setEditForm({ ...editForm, recording_url: e.target.value })} 
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Catatan</label>
                <Input 
                  value={editForm.notes} 
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} 
                />
              </div>
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
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingItem(null)}>Batal</Button>
              <Button onClick={handleSaveEdit} className="gap-1.5">
                <Save className="w-4 h-4" /> Simpan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}