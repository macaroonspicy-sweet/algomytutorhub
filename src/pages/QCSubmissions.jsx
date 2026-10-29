const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useState } from 'react';

import { useAppAuth } from '@/lib/AppAuthContext';
import { invokeService } from '@/lib/appApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import Pagination from '@/components/ui/pagination';
import ExportDialog from '@/components/export/ExportDialog';
import { FileSpreadsheet, Loader2, Search, ExternalLink, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, MONTH_LABELS, periodLabel } from '@/lib/workflowUtils';

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
  const { currentUser } = useAppAuth();
  const [data, setData] = useState({ submissions: [], pending: [], summary: {} });
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    tutor_id: 'all', month: 'all', year: 'all', period: 'all', status: 'all', search: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await invokeService('qcSubmissionService', {
        action: 'monitoring',
        filters: {
          tutor_id: filters.tutor_id !== 'all' ? filters.tutor_id : '',
          month: filters.month,
          year: filters.year,
          period: filters.period,
          status: filters.status,
          search: filters.search,
        },
      });
      if (res.data?.error) throw new Error(res.data.error);
      setData({
        submissions: res.data.submissions || [],
        pending: res.data.pending || [],
        summary: res.data.summary || {},
      });
    } catch (err) {
      toast.error('Could not load QC submissions', { description: err?.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser?.id) return;
    db.entities.CustomUser.list().then((users) => {
      setTutors((users || []).filter((u) => ['Tutor', 'Team Leader'].includes(u.role) && u.is_active !== false));
    }).catch(() => setTutors([]));
  }, [currentUser?.id]);

  useEffect(() => { if (currentUser?.id) load(); }, [currentUser?.id, filters]);
  useEffect(() => { setPage(1); }, [filters]);

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const submissions = data.submissions;
  const totalPages = Math.ceil(submissions.length / PER_PAGE);
  const paginated = submissions.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const currentYear = new Date().getFullYear();
  const years = [...new Set([currentYear, currentYear - 1, ...submissions.map((s) => s.period_year).filter(Boolean)])].sort((a, b) => b - a);

  const exportFilters = {
    tutor_id: filters.tutor_id !== 'all' ? filters.tutor_id : '',
    period: filters.period,
    record_month: filters.month,
    record_year: filters.year,
    status: filters.status,
    search: filters.search,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">QC Submissions</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Class recordings submitted by tutors, with the QC period taken from the class date.
          </p>
        </div>
        <Button variant="outline" onClick={() => setExportOpen(true)} className="border-border gap-2">
          <FileSpreadsheet className="w-4 h-4" /> Export Excel
        </Button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Current submissions" value={data.summary.submissions || 0} icon={CheckCircle2} tone="bg-chart-3/70" />
        <StatCard label="Resubmitted" value={data.summary.resubmissions || 0} icon={Clock} tone="bg-primary/70" />
        <StatCard label="Not submitted yet" value={data.summary.pending || 0} icon={AlertTriangle} tone="bg-destructive/70" />
        <StatCard label="Tutors involved" value={data.summary.tutors || 0} icon={Search} tone="bg-accent/70" />
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={filters.search} onChange={(e) => set('search', e.target.value)} placeholder="Search tutor, class or task..." className="pl-9" />
          </div>
          <Select value={filters.tutor_id} onValueChange={(v) => set('tutor_id', v)}>
            <SelectTrigger className="lg:w-44"><SelectValue placeholder="Tutor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tutors</SelectItem>
              {tutors.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.month} onValueChange={(v) => set('month', v)}>
            <SelectTrigger className="lg:w-36"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {MONTH_LABELS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.year} onValueChange={(v) => set('year', v)}>
            <SelectTrigger className="lg:w-28"><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.period} onValueChange={(v) => set('period', v)}>
            <SelectTrigger className="lg:w-36"><SelectValue placeholder="Period" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All periods</SelectItem>
              <SelectItem value="1">Period 1 (1–16)</SelectItem>
              <SelectItem value="2">Period 2 (17–end)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(v) => set('status', v)}>
            <SelectTrigger className="lg:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="superseded">Replaced</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground">
          {submissions.length} submission{submissions.length === 1 ? '' : 's'} · {data.pending.length} still to submit
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Submissions</h2>
          {filters.status !== 'submitted' && <span className="text-[11px] text-muted-foreground">Includes replaced versions</span>}
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : paginated.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No submissions match this view.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Tutor</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Class date</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((s) => (
                  <tr key={s.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-foreground">{s.tutor_name}</td>
                    <td className="px-4 py-3">
                      <div className="text-foreground">{s.class_name || '—'}</div>
                      {s.task_title && <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{s.task_title}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {periodLabel(s.period)}<div className="text-[10px]">{s.period_month}/{s.period_year}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(s.class_date)}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {s.submitted_at ? new Date(s.submitted_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      <div className="text-[10px]">v{s.version || 1}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={s.status === 'superseded'
                        ? 'border-border text-muted-foreground text-[10px]'
                        : 'border-chart-3/40 text-chart-3 text-[10px]'}>
                        {s.status === 'superseded' ? 'Replaced' : 'Submitted'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a href={s.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline text-xs">
                        <ExternalLink className="w-3.5 h-3.5" /> Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Not submitted yet</h2>
          <p className="text-[11px] text-muted-foreground">QC Submission tasks without a matching submission.</p>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : data.pending.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Everyone has submitted.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Tutor</th>
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.pending.map((p) => (
                  <tr key={p.task_id}>
                    <td className="px-4 py-3 text-foreground">{p.tutor_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.task_title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.class_name || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(p.deadline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultModule="qc_submissions"
        modules={[
          { value: 'qc_submissions', label: 'QC Submissions', hint: 'Tutor, class, recording link, dates, period and status' },
          { value: 'qc_records', label: 'QC Records', hint: 'Scored QC evaluations per period' },
        ]}
        filters={exportFilters}
      />
    </div>
  );
}