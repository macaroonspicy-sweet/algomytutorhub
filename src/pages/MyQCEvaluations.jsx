const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';

import { useAppAuth } from '@/lib/AppAuthContext';
import { Award, ChevronDown, ChevronUp, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateQCEvaluationPDF, generateQCMonthlyPDF } from '@/lib/pdfGenerator';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import Pagination from '@/components/ui/Pagination';
import { Filter } from 'lucide-react';

const GRADE_OPTIONS = ['Excellent', 'Good', 'Fair', 'Needs Improvement', 'Critical'];
const ITEMS_PER_PAGE = 6;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const GRADE_COLORS = {
  'Excellent':         'text-green-400 bg-green-400/15 border-green-400/30',
  'Good':              'text-blue-400 bg-blue-400/15 border-blue-400/30',
  'Fair':              'text-yellow-400 bg-yellow-400/15 border-yellow-400/30',
  'Needs Improvement': 'text-orange-400 bg-orange-400/15 border-orange-400/30',
  'Critical':          'text-red-400 bg-red-400/15 border-red-400/30',
};

const SCORE_COLORS = {
  1: 'text-red-400', 2: 'text-orange-400', 3: 'text-yellow-400',
  4: 'text-blue-400', 5: 'text-green-400',
};

function PeriodCard({ record, aspects, periodLabel }) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!record) {
    return (
      <div className="bg-muted/30 rounded-xl p-4 text-center flex flex-col justify-center min-h-[150px]">
        <div className="text-xs text-muted-foreground mb-1">{periodLabel}</div>
        <div className="text-xs text-muted-foreground/50">Not yet evaluated</div>
      </div>
    );
  }

  const gradeClass = GRADE_COLORS[record.final_grade] || 'text-muted-foreground bg-muted border-border';

  const handleDownload = async () => {
    setDownloading(true);
    await generateQCEvaluationPDF(record, aspects);
    setDownloading(false);
  };

  return (
    <div className="bg-muted rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{periodLabel}</div>
        <div className={`px-2 py-0.5 rounded-md text-xs font-bold border ${gradeClass}`}>{record.final_grade || '-'}</div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-foreground">{Math.round(record.evaluation_score || 0)}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
      {record.record_date && (
        <div className="text-[10px] text-muted-foreground/60">
          {new Date(record.record_date).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}
        </div>
      )}
      {record.auto_generated_notes && (
        <div className="text-xs text-foreground/70 leading-relaxed">{record.auto_generated_notes}</div>
      )}
      <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading} className="w-full text-xs h-8 gap-1.5 border-border text-muted-foreground hover:text-foreground">
        {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Download PDF
      </Button>
      {aspects.length > 0 && (
        <>
          <button onClick={() => setExpanded(e => !e)} className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Hide' : 'View'} Aspects
          </button>
          {expanded && (
            <div className="space-y-1.5 pt-1">
              {aspects.map((asp, i) => {
                const s = (record.aspect_scores || {})[asp.aspect_name]?.point || 0;
                return (
                  <div key={asp.id} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                    <span className="text-foreground/80 flex-1 pr-2">{i + 1}. {asp.aspect_name}</span>
                    <span className={`font-bold ${SCORE_COLORS[s] || ''}`}>{s || '-'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MonthlyCard({ monthly, p1, p2, aspects }) {
  const [downloading, setDownloading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const gradeClass = GRADE_COLORS[monthly.monthly_final_grade] || 'text-muted-foreground bg-muted border-border';

  const handleDownload = async () => {
    setDownloading(true);
    await generateQCMonthlyPDF(monthly, p1, p2, aspects);
    setDownloading(false);
  };

  return (
    <div className={`rounded-xl p-4 border space-y-3 ${gradeClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4" />
          <span className="text-sm font-semibold">Monthly</span>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-black/20">{monthly.monthly_final_grade || '-'}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold">{monthly.monthly_score || 0}</span>
        <span className="text-xs opacity-70">/ 100</span>
      </div>
      {monthly.record_date && (
        <div className="text-[10px] opacity-60">
          Generated: {new Date(monthly.record_date).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}
        </div>
      )}
      {aspects.length > 0 && (
        <>
          <button onClick={() => setExpanded(e => !e)} className="w-full text-xs opacity-80 hover:opacity-100 flex items-center justify-center gap-1.5">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Hide' : 'View'} Aspect Averages
          </button>
          {expanded && (
            <div className="space-y-1.5 pt-1">
              {aspects.map((asp, i) => {
                const aspData = (monthly.monthly_aspect_scores || {})[asp.id] || {};
                const avg = aspData.avg || 0;
                return (
                  <div key={asp.id} className="flex items-center justify-between text-xs py-1 border-b border-black/10 last:border-0">
                    <span className="flex-1 pr-2">{i + 1}. {asp.aspect_name}</span>
                    <span className={`font-bold ${SCORE_COLORS[avg] || ''}`}>{avg || '-'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {monthly.monthly_notes && (
        <div className="text-xs bg-black/10 rounded-lg p-2">
          <div className="font-semibold mb-0.5">Notes from QC Team</div>
          <div className="opacity-90">{monthly.monthly_notes}</div>
        </div>
      )}
      <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading} className="w-full text-xs h-8 gap-1.5 bg-black/10 border-black/20 hover:bg-black/20">
        {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Download Monthly PDF
      </Button>
    </div>
  );
}

function MonthGroup({ monthKey, period1, period2, monthly, aspects }) {
  const [periodMonth, periodYear] = monthKey.split('-').map(Number);
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div>
        <div className="font-semibold text-foreground text-lg">
          {MONTHS[(periodMonth || 1) - 1]} {periodYear}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">QC Evaluation Records</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <PeriodCard record={period1} aspects={aspects} periodLabel="Period 1 (Day 1–15)" />
        <PeriodCard record={period2} aspects={aspects} periodLabel="Period 2 (Day 16–31)" />
        {monthly ? (
          <MonthlyCard monthly={monthly} p1={period1} p2={period2} aspects={aspects} />
        ) : (
          <div className="bg-muted/30 rounded-xl p-4 text-center flex flex-col justify-center min-h-[150px]">
            <div className="text-xs text-muted-foreground mb-1">Monthly Evaluation</div>
            <div className="text-xs text-muted-foreground/50">Not generated yet</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MyQCEvaluations() {
  const { currentUser } = useAppAuth();
  const [qcRecords, setQcRecords] = useState([]);
  const [monthlyEvals, setMonthlyEvals] = useState([]);
  const [aspects, setAspects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { setCurrentPage(1); }, [filterYear, filterMonth, filterPeriod]);

  useEffect(() => {
    const load = async () => {
      if (!currentUser) return;
      const [recs, evals, asps] = await Promise.all([
        db.entities.QCRecord.filter({ tutor_id: currentUser.id }, '-period_year'),
        db.entities.QCMonthlyEvaluation.filter({ tutor_id: currentUser.id }, '-period_year'),
        db.entities.QCEvaluationAspect.list('order_index'),
      ]);
      setQcRecords(recs);
      setMonthlyEvals(evals);
      setAspects(asps);
      setLoading(false);
    };
    load();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Build month groups from QC records + monthly evals
  const monthMap = {};
  qcRecords.forEach(r => {
    const key = `${r.period_month}-${r.period_year}`;
    if (!monthMap[key]) monthMap[key] = { period1: null, period2: null, monthly: null, period_month: r.period_month, period_year: r.period_year };
    if (r.period === 1) monthMap[key].period1 = r;
    else if (r.period === 2) monthMap[key].period2 = r;
  });
  monthlyEvals.forEach(m => {
    const key = `${m.period_month}-${m.period_year}`;
    if (!monthMap[key]) monthMap[key] = { period1: null, period2: null, monthly: null, period_month: m.period_month, period_year: m.period_year };
    monthMap[key].monthly = m;
  });

  const allKeys = Object.keys(monthMap).sort((a, b) => {
    const [am, ay] = a.split('-').map(Number);
    const [bm, by] = b.split('-').map(Number);
    return by - ay || bm - am;
  });

  // Available years for the year filter
  const availableYears = [...new Set(allKeys.map(k => monthMap[k].period_year).filter(Boolean))].sort((a, b) => b - a);

  // Apply filters
  const filteredKeys = allKeys.filter(key => {
    const grp = monthMap[key];
    if (filterYear !== 'all' && String(grp.period_year) !== filterYear) return false;
    if (filterMonth !== 'all' && String(grp.period_month) !== filterMonth) return false;
    if (filterPeriod !== 'all' && !grp[`period${filterPeriod}`]) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredKeys.length / ITEMS_PER_PAGE) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedKeys = filteredKeys.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const resetFilters = () => {
    setFilterYear('all'); setFilterMonth('all'); setFilterPeriod('all');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">My QC Evaluations</h2>
        <p className="text-muted-foreground text-sm mt-0.5">Hasil evaluasi QC kamu</p>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Filter className="w-4 h-4" /> Filter
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="bg-background"><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="bg-background"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger className="bg-background"><SelectValue placeholder="Period" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Periods</SelectItem>
              <SelectItem value="1">Period 1 (Day 1–15)</SelectItem>
              <SelectItem value="2">Period 2 (Day 16–31)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(filterYear !== 'all' || filterMonth !== 'all' || filterPeriod !== 'all') && (
          <button onClick={resetFilters} className="text-xs text-primary hover:underline">Reset filters</button>
        )}
      </div>

      {filteredKeys.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
          Belum ada evaluasi QC untuk kamu.
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedKeys.map(key => (
              <MonthGroup key={key} monthKey={key} {...monthMap[key]} aspects={aspects} />
            ))}
          </div>
          <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </>
      )}
    </div>
  );
}