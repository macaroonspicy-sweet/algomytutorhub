const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';

import { useAppAuth } from '@/lib/AppAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Download, Loader2, RefreshCw, Award, FileText, Save, Eye, Search, X, Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { generateQCMonthlyPDF, previewQCMonthlyPDF } from '@/lib/pdfGenerator';
import Pagination from '@/components/ui/Pagination';
import PDFPreviewDialog from '@/components/qc/PDFPreviewDialog';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
import TelegramSendDialog from '@/components/qc/TelegramSendDialog';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const GRADE_COLORS = {
  'Excellent':         'text-green-400 bg-green-400/15',
  'Good':              'text-blue-400 bg-blue-400/15',
  'Fair':              'text-yellow-400 bg-yellow-400/15',
  'Needs Improvement': 'text-orange-400 bg-orange-400/15',
  'Critical':          'text-red-400 bg-red-400/15',
};

const getGrade = (score) => {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Fair';
  if (score >= 60) return 'Needs Improvement';
  return 'Critical';
};

export default function QCMonthlyPage() {
  const { hasPermission, currentUser } = useAppAuth();
  const canDelete = hasPermission('qc_monthly_delete');
  const [records, setRecords] = useState([]);
  const [monthlyEvals, setMonthlyEvals] = useState([]);
  const [tutors, setTutors] = useState([]);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [searchTutor, setSearchTutor] = useState('');
  const [filterGrade, setFilterGrade] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;
  const [generating, setGenerating] = useState({});
  const [notesDialog, setNotesDialog] = useState(null); // { monthly, tutor }
  const [notesInput, setNotesInput] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [previewDialog, setPreviewDialog] = useState(null); // { monthly, title }
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [tgTarget, setTgTarget] = useState(null);
  const [sendingTg, setSendingTg] = useState({});
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);

  useEffect(() => { loadData(); }, [filterMonth, filterYear]);

  const loadData = async () => {
    const [recs, evals, users] = await Promise.all([
      db.entities.QCRecord.filter({ period_month: filterMonth, period_year: filterYear }),
      db.entities.QCMonthlyEvaluation.filter({ period_month: filterMonth, period_year: filterYear }),
      db.entities.CustomUser.list(),
    ]);
    setRecords(recs);
    setMonthlyEvals(evals);
    setTutors(users.filter(u => u.role === 'Tutor' || u.role === 'Team Leader'));
  };

  const getRecordsForTutor = (tutorId) => ({
    p1: records.find(r => r.tutor_id === tutorId && r.period === 1),
    p2: records.find(r => r.tutor_id === tutorId && r.period === 2),
  });

  const getMonthlyForTutor = (tutorId) => monthlyEvals.find(e => e.tutor_id === tutorId);

  const generateMonthly = async (tutor) => {
    const { p1, p2 } = getRecordsForTutor(tutor.id);
    if (!p1 || !p2) return;
    setGenerating(g => ({ ...g, [tutor.id]: true }));

    const monthlyScore = Math.floor((p1.evaluation_score + p2.evaluation_score) / 2);
    const monthlyGrade = getGrade(monthlyScore);

    const aspectList = await db.entities.QCEvaluationAspect.list('order_index');
    const nameToId = {};
    aspectList.forEach(a => { nameToId[a.aspect_name] = a.id; });
    const allKeys = new Set([
      ...Object.keys(p1.aspect_scores || {}),
      ...Object.keys(p2.aspect_scores || {}),
    ]);
    const monthlyAspectScores = {};
    allKeys.forEach(key => {
      const id = nameToId[key] || key;
      const e1 = (p1.aspect_scores || {})[key];
      const e2 = (p2.aspect_scores || {})[key];
      const s1 = (e1 && typeof e1 === 'object') ? (e1.point || 0) : (typeof e1 === 'number' ? e1 : 0);
      const s2 = (e2 && typeof e2 === 'object') ? (e2.point || 0) : (typeof e2 === 'number' ? e2 : 0);
      monthlyAspectScores[id] = { p1: s1, p2: s2, avg: Math.floor((s1 + s2) / 2) };
    });

    const data = {
      tutor_id: tutor.id,
      tutor_name: tutor.full_name,
      tutor_photo: tutor.photo_url || '',
      period_month: filterMonth,
      period_year: filterYear,
      record_date: new Date().toISOString().split('T')[0],
      period_1_record_id: p1.id,
      period_2_record_id: p2.id,
      period_1_score: p1.evaluation_score,
      period_2_score: p2.evaluation_score,
      period_1_grade: p1.final_grade,
      period_2_grade: p2.final_grade,
      monthly_score: monthlyScore,
      monthly_final_grade: monthlyGrade,
      monthly_aspect_scores: monthlyAspectScores,
    };

    const existing = getMonthlyForTutor(tutor.id);
    if (existing) {
      await db.entities.QCMonthlyEvaluation.update(existing.id, data);
      toast.success('Monthly evaluation updated', { description: `${tutor.full_name}'s monthly evaluation has been regenerated.` });
    } else {
      await db.entities.QCMonthlyEvaluation.create(data);
      toast.success('Monthly evaluation generated', { description: `${tutor.full_name}'s monthly evaluation is ready.` });
    }

    setGenerating(g => ({ ...g, [tutor.id]: false }));
    loadData();
  };

  const openNotesDialog = (monthly, tutor) => {
    setNotesDialog({ monthly, tutor });
    setNotesInput(monthly.monthly_notes || '');
  };

  const handleDeleteMonthly = (monthly) => {
    if (!canDelete) {
      toast.error('Delete not allowed', { description: 'You do not have permission to delete monthly evaluations.' });
      return;
    }
    setDeleteTarget(monthly);
  };

  const confirmDeleteMonthly = async () => {
    await db.entities.QCMonthlyEvaluation.delete(deleteTarget.id);
    setDeleteTarget(null);
    loadData();
    toast.success('Monthly evaluation deleted');
  };

  const saveNotes = async () => {
    if (!notesDialog) return;
    setSavingNotes(true);
    await db.entities.QCMonthlyEvaluation.update(notesDialog.monthly.id, { monthly_notes: notesInput });
    setSavingNotes(false);
    setNotesDialog(null);
    loadData();
    toast.success('Notes saved', { description: `Monthly notes for ${notesDialog.tutor?.full_name} have been saved.` });
  };

  const handleDownloadPDF = async (monthly) => {
    setDownloading(true);
    const aspects = await db.entities.QCEvaluationAspect.list('order_index');
    const p1 = records.find(r => r.id === monthly.period_1_record_id);
    const p2 = records.find(r => r.id === monthly.period_2_record_id);
    await generateQCMonthlyPDF(monthly, p1, p2, aspects);
    setDownloading(false);
  };

  const handlePreviewPDF = async (monthly) => {
    const title = `Preview — ${monthly.tutor_name} (${MONTHS[monthly.period_month - 1]} ${monthly.period_year})`;
    setPreviewDialog({ monthly, title });
    setPreviewUrl(null);
    setPreviewLoading(true);
    const aspects = await db.entities.QCEvaluationAspect.list('order_index');
    const p1 = records.find(r => r.id === monthly.period_1_record_id);
    const p2 = records.find(r => r.id === monthly.period_2_record_id);
    const url = await previewQCMonthlyPDF(monthly, p1, p2, aspects);
    setPreviewUrl(url);
    setPreviewLoading(false);
  };

  const handleClosePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewDialog(null);
    setPreviewUrl(null);
  };

  const handleSendTelegram = (monthly, tutor) => {
    if (!tutor?.telegram_account) { toast.error('Tutor has no Telegram account saved.'); return; }
    if (!currentUser?.telegram_bot_token) {
      toast.error('No Telegram Bot Token', { description: 'Please set your Telegram Bot Token in My Profile before sending.' });
      return;
    }
    const monthLabel = `${MONTHS[monthly.period_month - 1]} ${monthly.period_year}`;
    const message = `📊 *Monthly QC Evaluation - ${monthly.tutor_name}*\n\n${monthLabel}\n\nPeriod 1: *${Math.round(monthly.period_1_score || 0)}/100* (${monthly.period_1_grade || '-'})\nPeriod 2: *${Math.round(monthly.period_2_score || 0)}/100* (${monthly.period_2_grade || '-'})\n\n📈 Monthly Score: *${monthly.monthly_score}/100*\n🏆 Grade: *${monthly.monthly_final_grade || 'N/A'}*\n\n📝 _${monthly.monthly_notes || 'No additional notes.'}_`;
    setTgTarget({ monthly, tutor, message });
  };

  const monthlyPdfGenerator = async () => {
    const aspects = await db.entities.QCEvaluationAspect.list('order_index');
    const p1 = records.find(r => r.id === tgTarget.monthly.period_1_record_id);
    const p2 = records.find(r => r.id === tgTarget.monthly.period_2_record_id);
    const blob = await generateQCMonthlyPDF(tgTarget.monthly, p1, p2, aspects, { returnBlob: true });
    const filename = `QC_Monthly_${tgTarget.monthly.tutor_name}_${MONTHS[tgTarget.monthly.period_month - 1]}_${tgTarget.monthly.period_year}.pdf`;
    return { blob, filename };
  };

  const GRADES = ['Excellent', 'Good', 'Fair', 'Needs Improvement', 'Critical'];
  const activeTutorIds = [...new Set(records.map(r => r.tutor_id))];
  const activeTutors = tutors.filter(t => {
    if (!activeTutorIds.includes(t.id)) return false;
    if (searchTutor && !t.full_name?.toLowerCase().includes(searchTutor.toLowerCase())) return false;
    if (filterGrade !== 'all') {
      const monthly = getMonthlyForTutor(t.id);
      if (!monthly || monthly.monthly_final_grade !== filterGrade) return false;
    }
    return true;
  });

  // Calculate pagination
  const totalPages = Math.ceil(activeTutors.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedTutors = activeTutors.slice(startIndex, endIndex);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTutor, filterGrade, filterMonth, filterYear]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Monthly QC Evaluation</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Combined Period 1 + Period 2 — floor((P1 + P2) / 2)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={String(filterMonth)} onValueChange={v => setFilterMonth(Number(v))}>
            <SelectTrigger className="w-36 bg-muted border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(filterYear)} onValueChange={v => setFilterYear(Number(v))}>
            <SelectTrigger className="w-24 bg-muted border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search & Grade Filter */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchTutor} onChange={e => setSearchTutor(e.target.value)} placeholder="Search tutor name..." className="pl-9 bg-muted border-border" />
        </div>
        <Select value={filterGrade} onValueChange={setFilterGrade}>
          <SelectTrigger className="w-44 bg-muted border-border"><SelectValue placeholder="All Grades" /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Grades</SelectItem>
            {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        {(searchTutor || filterGrade !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchTutor(''); setFilterGrade('all'); }} className="text-muted-foreground gap-1.5">
            <X className="w-3.5 h-3.5" /> Clear
          </Button>
        )}
      </div>

      {activeTutors.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
          No QC records found for {MONTHS[filterMonth - 1]} {filterYear}.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginatedTutors.map(tutor => {
            const { p1, p2 } = getRecordsForTutor(tutor.id);
            const monthly = getMonthlyForTutor(tutor.id);
            const canGenerate = !!(p1 && p2);
            const gradeClass = GRADE_COLORS[monthly?.monthly_final_grade] || '';

            return (
              <div key={tutor.id} className="bg-card border border-border rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  {tutor.photo_url ? (
                    <img src={tutor.photo_url} className="w-10 h-10 rounded-xl object-cover" alt="" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                      {tutor.full_name?.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-foreground">{tutor.full_name}</div>
                    <div className="text-xs text-muted-foreground">{MONTHS[filterMonth - 1]} {filterYear}</div>
                    {monthly?.record_date && (
                      <div className="text-xs text-muted-foreground/60">Generated: {new Date(monthly.record_date).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}</div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className={`p-3 rounded-xl text-center ${p1 ? 'bg-muted' : 'bg-muted/30'}`}>
                    <div className="text-xs text-muted-foreground mb-1">Period 1</div>
                    {p1 ? (
                      <>
                        <div className="text-lg font-bold text-foreground">{Math.round(p1.evaluation_score)}</div>
                        <div className={`text-xs mt-0.5 ${GRADE_COLORS[p1.final_grade]?.split(' ')[0] || ''}`}>{p1.final_grade}</div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground/50">Not yet</div>
                    )}
                  </div>
                  <div className={`p-3 rounded-xl text-center ${p2 ? 'bg-muted' : 'bg-muted/30'}`}>
                    <div className="text-xs text-muted-foreground mb-1">Period 2</div>
                    {p2 ? (
                      <>
                        <div className="text-lg font-bold text-foreground">{Math.round(p2.evaluation_score)}</div>
                        <div className={`text-xs mt-0.5 ${GRADE_COLORS[p2.final_grade]?.split(' ')[0] || ''}`}>{p2.final_grade}</div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground/50">Not yet</div>
                    )}
                  </div>
                </div>

                {monthly && (
                  <div className={`p-3 rounded-xl flex items-center justify-between ${gradeClass}`}>
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4" />
                      <span className="text-sm font-medium">Monthly Score</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">{monthly.monthly_score}</span>
                      <span className="text-xs font-semibold opacity-80">/ 100</span>
                      <span className={`text-xs px-2 py-0.5 rounded-md font-bold bg-black/20`}>{monthly.monthly_final_grade}</span>
                    </div>
                  </div>
                )}

                {!canGenerate && !monthly && (
                  <p className="text-xs text-muted-foreground text-center italic">
                    Requires both Period 1 and Period 2 to generate the monthly evaluation
                  </p>
                )}

                <div className="flex gap-2 flex-wrap">
                  {canGenerate && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => generateMonthly(tutor)}
                      disabled={!!generating[tutor.id]}
                      className="flex-1 gap-1.5 border-primary/40 text-primary hover:bg-primary/10 text-xs h-8"
                    >
                      {generating[tutor.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      {monthly ? 'Regenerate' : 'Generate Monthly'}
                    </Button>
                  )}
                  {monthly && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => openNotesDialog(monthly, tutor)}
                      className={`gap-1.5 text-xs h-8 relative ${monthly.monthly_notes ? 'border-accent/50 text-accent hover:bg-accent/10' : 'border-border text-muted-foreground hover:bg-muted'}`}
                    >
                      <FileText className="w-3 h-3" />
                      Notes
                      {monthly.monthly_notes && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full" />
                      )}
                    </Button>
                  )}
                  {monthly && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => handlePreviewPDF(monthly)}
                      className="flex-1 gap-1.5 border-border text-xs h-8"
                    >
                      <Eye className="w-3 h-3" /> Preview PDF
                    </Button>
                  )}
                  {monthly && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => handleSendTelegram(monthly, tutor)}
                      disabled={!!sendingTg[monthly.id]}
                      className="flex-1 gap-1.5 border-accent/40 text-accent hover:bg-accent/10 text-xs h-8"
                    >
                      {sendingTg[monthly.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Telegram
                    </Button>
                  )}
                  {monthly && canDelete && (
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => handleDeleteMonthly(monthly)}
                      className="w-8 h-8 p-0 hover:bg-destructive/20 hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
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

      {activeTutors.length > 0 && (
        <div className="text-xs text-muted-foreground text-center mt-4">
          Showing {startIndex + 1} to {Math.min(endIndex, activeTutors.length)} of {activeTutors.length} tutors
        </div>
      )}
      {/* PDF Preview Dialog */}
      <PDFPreviewDialog
        open={!!previewDialog}
        onOpenChange={(open) => { if (!open) handleClosePreview(); }}
        pdfUrl={previewUrl}
        title={previewDialog?.title || ''}
        onDownload={() => previewDialog && handleDownloadPDF(previewDialog.monthly)}
        downloading={downloading}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        onConfirm={confirmDeleteMonthly}
        title="Delete Monthly Evaluation"
        description="Are you sure you want to delete this monthly evaluation? This action cannot be undone."
      />

      <TelegramSendDialog
        open={!!tgTarget}
        onOpenChange={(v) => { if (!v) setTgTarget(null); }}
        record={tgTarget?.monthly}
        telegramAccount={tgTarget?.tutor?.telegram_account}
        displayName={tgTarget?.monthly?.tutor_name}
        initialMessage={tgTarget?.message}
        pdfBlobGenerator={tgTarget ? monthlyPdfGenerator : undefined}
        botToken={currentUser?.telegram_bot_token || ''}
        onSendingChange={(s) => { if (tgTarget) setSendingTg(prev => ({ ...prev, [tgTarget.monthly.id]: s })); }}
      />

      {/* Notes Dialog */}
      <Dialog open={!!notesDialog} onOpenChange={() => setNotesDialog(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Monthly Notes — {notesDialog?.tutor?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Notes — {MONTHS[filterMonth - 1]} {filterYear}</Label>
              <Textarea
                value={notesInput}
                onChange={e => setNotesInput(e.target.value)}
                placeholder="Tulis catatan evaluasi bulanan..."
                className="bg-muted border-border min-h-[120px]"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setNotesDialog(null)} className="border-border">Cancel</Button>
              <Button onClick={saveNotes} disabled={savingNotes} className="bg-primary hover:bg-primary/90 gap-2">
                {savingNotes && <Loader2 className="w-4 h-4 animate-spin" />}
                <Save className="w-4 h-4" /> Save Notes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}