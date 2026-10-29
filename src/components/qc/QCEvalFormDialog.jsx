const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calculator } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const GRADE_INFO = {
  'Excellent':         { color: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-400/30'  },
  'Good':              { color: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/30'   },
  'Fair':              { color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30' },
  'Needs Improvement': { color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/30' },
  'Critical':          { color: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/30'    },
};

export function getGrade(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Fair';
  if (score >= 60) return 'Needs Improvement';
  return 'Critical';
}

const TODAY = new Date().toISOString().split('T')[0];

const EMPTY_FORM = {
  admin_qc_id: '', admin_qc_name: '', tutor_id: '', tutor_name: '', tutor_photo: '', tutor_telegram: '',
  period: 1, period_month: new Date().getMonth() + 1, period_year: new Date().getFullYear(),
  record_date: TODAY,
  aspect_scores: {}, notes: ''
};

export default function QCEvalFormDialog({ open, onOpenChange, editing, admins, tutors, onSaved }) {
  const { toast } = useToast();
  const [aspects, setAspects] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.entities.QCEvaluationAspect.list('order_index').then(setAspects);
  }, []);

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({ ...EMPTY_FORM, ...editing, aspect_scores: editing.aspect_scores || {} });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [editing, open]);

  const getScoreOf = (asp) => {
    const e = form.aspect_scores[asp.aspect_name];
    if (e && typeof e === 'object') return e.point || 0;
    if (typeof e === 'number') return e;
    const byId = form.aspect_scores[asp.id];
    return typeof byId === 'number' ? byId : 0;
  };

  const calcScore = () => {
    let total = 0;
    aspects.forEach(asp => {
      const score = getScoreOf(asp);
      total += (score / 5) * (asp.weight_percentage || 0);
    });
    return Math.floor(total * 10) / 10;
  };

  const generateAutoNotes = () => {
    const low = aspects.filter(a => {
      const s = getScoreOf(a);
      return s > 0 && s <= 2;
    });
    const excellent = aspects.filter(a => getScoreOf(a) === 5);
    let notes = '';
    if (excellent.length > 0) notes += `Excellent in: ${excellent.map(a => a.aspect_name).join(', ')}. `;
    if (low.length > 0) notes += `Needs improvement in: ${low.map(a => a.aspect_name).join(', ')}.`;
    if (!notes) notes = 'Tutor has demonstrated satisfactory performance across all evaluated aspects.';
    return notes;
  };

  const handleTutorChange = (id) => {
    const t = tutors.find(u => u.id === id);
    if (t) setForm(f => ({ ...f, tutor_id: id, tutor_name: t.full_name, tutor_photo: t.photo_url || '', tutor_telegram: t.telegram_account || '' }));
  };

  const handleAdminChange = (id) => {
    const a = admins.find(u => u.id === id);
    if (a) setForm(f => ({ ...f, admin_qc_id: id, admin_qc_name: a.full_name }));
  };

  const handleSave = async () => {
    const score = calcScore();
    const grade = getGrade(score);
    const autoNotes = generateAutoNotes();
    setSaving(true);
    const data = { ...form, evaluation_score: score, final_grade: grade, auto_generated_notes: autoNotes };
    if (editing) {
      await db.entities.QCRecord.update(editing.id, data);
      toast({ title: 'QC record updated', description: `Evaluation for ${data.tutor_name} has been updated.` });
    } else {
      const created = await db.entities.QCRecord.create(data);
      // Send notification to the tutor
      if (data.tutor_id) {
        const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        await db.entities.Notification.create({
          recipient_id: data.tutor_id,
          type: 'qc_created',
          title: 'New QC Evaluation',
          message: `Your QC evaluation for Period ${data.period} — ${MONTHS[(data.period_month||1)-1]} ${data.period_year} has been submitted. Score: ${Math.round(score)}/100 (${grade}).`,
          reference_id: created?.id || '',
          is_read: false,
        });
      }
      toast({ title: 'QC record created', description: `Evaluation for ${data.tutor_name} has been saved.` });
    }
    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  const score = calcScore();
  const grade = getGrade(score);
  const gradeStyle = GRADE_INFO[grade] || GRADE_INFO['Fair'];
  const filledCount = Object.values(form.aspect_scores).filter(e => (e && typeof e === 'object' ? e.point : e) > 0).length;
  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i);

  const SCORE_LABEL_COLORS = ['', 'text-red-400', 'text-orange-400', 'text-yellow-400', 'text-blue-400', 'text-green-400'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit QC Evaluation' : 'New QC Evaluation'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>Record Date</Label>
              <Input
                type="date"
                value={form.record_date || TODAY}
                onChange={e => setForm(f => ({ ...f, record_date: e.target.value }))}
                className="bg-muted border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Admin QC</Label>
              <Select value={form.admin_qc_id} onValueChange={handleAdminChange}>
                <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select Admin QC" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {admins.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tutor</Label>
              <Select value={form.tutor_id} onValueChange={handleTutorChange}>
                <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select Tutor" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {tutors.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select value={String(form.period)} onValueChange={v => setForm(f => ({ ...f, period: Number(v) }))}>
                <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="1">Period 1 (Day 1–15)</SelectItem>
                  <SelectItem value="2">Period 2 (Day 16–31)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Select value={String(form.period_month)} onValueChange={v => setForm(f => ({ ...f, period_month: Number(v) }))}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Select value={String(form.period_year)} onValueChange={v => setForm(f => ({ ...f, period_year: Number(v) }))}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Live Score */}
          <div className={`flex items-center justify-between p-4 rounded-xl border ${gradeStyle.bg} ${gradeStyle.border}`}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calculator className="w-4 h-4" />
              <span>{filledCount}/{aspects.length} aspects filled</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-baseline gap-1.5">
                <div className="text-3xl font-bold text-foreground">{Math.round(score)}</div>
                <div className="text-sm text-muted-foreground font-medium">/ 100</div>
              </div>
              <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${gradeStyle.bg} ${gradeStyle.color} ${gradeStyle.border} border`}>
                {filledCount > 0 ? grade : '—'}
              </div>
            </div>
          </div>

          {/* Aspects */}
          {aspects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm bg-muted/30 rounded-xl">
              No evaluation aspects found. Add them in the <strong>QC Evaluation Aspects</strong> page.
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Evaluation Aspects</Label>
              {aspects.map((asp, i) => {
                const selectedScore = getScoreOf(asp);
                const desc = selectedScore ? (form.aspect_scores[asp.aspect_name]?.description || asp[`score_${selectedScore}_description`]) : null;
                return (
                  <div key={asp.id} className="bg-muted/40 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                      <span className="text-sm font-medium text-foreground flex-1">{asp.aspect_name}</span>
                      <span className="text-xs text-primary font-semibold shrink-0">({asp.weight_percentage}%)</span>
                      <Select
                        value={selectedScore ? String(selectedScore) : ''}
                        onValueChange={v => setForm(f => ({ ...f, aspect_scores: { ...f.aspect_scores, [asp.aspect_name]: { point: Number(v), description: asp[`score_${v}_description`] || '' } } }))}
                      >
                        <SelectTrigger className="w-28 bg-card border-border text-sm h-8 shrink-0">
                          <SelectValue placeholder="Score" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          {[1,2,3,4,5].map(s => (
                            <SelectItem key={s} value={String(s)}>
                              <span className={SCORE_LABEL_COLORS[s]}>Score {s}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {desc && (
                      <div className="ml-5 text-xs text-muted-foreground bg-card/60 rounded-lg px-3 py-2 italic border border-border/50">
                        {desc}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Additional Notes (optional)</Label>
            <textarea
              value={form.notes || ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground resize-none h-20 focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Additional notes from Admin QC..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.tutor_id} className="bg-primary hover:bg-primary/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? 'Update' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}