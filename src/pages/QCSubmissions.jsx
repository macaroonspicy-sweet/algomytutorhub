import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import Pagination from '@/components/ui/pagination';
import { FileSpreadsheet, Loader2, Search, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
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
  const [filters, setFilters] = useState({
    status: 'all', search: '',
  });

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
      toast.error('Could not load QC submissions', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, [filters.status]);

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const filtered = submissions.filter((s) => {
    if (!filters.search.trim()) return true;
    const q = filters.search.toLowerCase();
    return (
      (s.tutor_name && s.tutor_name.toLowerCase().includes(q)) ||
      (s.class_name && s.class_name.toLowerCase().includes(q)) ||
      (s.task_title && s.task_title.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const summary = {
    total: submissions.length,
    submitted: submissions.filter(s => s.status === 'submitted' || !s.status).length,
    superseded: submissions.filter(s => s.status === 'superseded').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">QC Submissions</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Class recordings and playlist links submitted by tutors.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <StatCard label="Total Submissions" value={summary.total} icon={CheckCircle2} tone="bg-chart-3/70" />
        <StatCard label="Active / Submitted" value={summary.submitted} icon={Clock} tone="bg-primary/70" />
        <StatCard label="Replaced / Superseded" value={summary.superseded} icon={Search} tone="bg-accent/70" />
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={filters.search} onChange={(e) => set('search', e.target.value)} placeholder="Search tutor name, class or task..." className="pl-9" />
          </div>
          <Select value={filters.status} onValueChange={(v) => set('status', v)}>
            <SelectTrigger className="lg:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="superseded">Replaced</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground">
          Showing {filtered.length} record(s)
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Submissions List</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : paginated.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No submissions found in Supabase.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Tutor</th>
                  <th className="px-4 py-3 font-medium">Class / Task</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Class Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Recording Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((s) => (
                  <tr key={s.id || s.created_date} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{s.tutor_name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="text-foreground">{s.class_name || '—'}</div>
                      {s.task_title && <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{s.task_title}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      Period {s.period || 1} <div className="text-[10px]">{s.period_month}/{s.period_year}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{s.class_date || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={s.status === 'superseded'
                        ? 'border-border text-muted-foreground text-[10px]'
                        : 'border-chart-3/40 text-chart-3 text-[10px]'}>
                        {s.status === 'superseded' ? 'Replaced' : (s.status || 'Submitted')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.recording_url ? (
                        <a href={s.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-medium">
                          <ExternalLink className="w-3.5 h-3.5" /> Open Link
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}
    </div>
  );
}