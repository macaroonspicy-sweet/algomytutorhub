import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Award } from 'lucide-react';
import { toast } from 'sonner';

// Urutan kriteria QC yang benar (dimulai dari Warming Up / Opening)
const DEFAULT_ASPECTS = [
  { id: 1, name: 'Warming Up / Opening', weight: 4 },
  { id: 2, name: 'Technical Readiness & Internet Stability', weight: 8 },
  { id: 3, name: 'Tutor\'s Emotional Control', weight: 7 },
  { id: 4, name: 'Interaction & Two-Way Communication', weight: 10 },
  { id: 5, name: 'Students Platform Engagement & Monitoring Progress', weight: 8 },
  { id: 6, name: 'Audience Coverage / Equal Attention', weight: 8 },
  { id: 7, name: 'Feedback & Praise', weight: 8 },
  { id: 8, name: 'Discipline in the Classroom', weight: 4 },
  { id: 9, name: 'Compliance with Methodological Guidelines', weight: 9 },
  { id: 10, name: 'Time Management', weight: 8 },
  { id: 11, name: 'Reflection / Lesson Recap', weight: 3 },
  { id: 12, name: 'Use of Platform Features', weight: 4 },
];

const SCORE_OPTIONS = [
  { label: 'Score 100%', value: 1.0 },
  { label: 'Score 75%', value: 0.75 },
  { label: 'Score 50%', value: 0.5 },
  { label: 'Score 25%', value: 0.25 },
  { label: 'Score 0%', value: 0.0 },
];

export default function QCEvalFormDialog({ open, onOpenChange, editing, admins = [], tutors = [], onSaved }) {
  const [loading, setLoading] = useState(false);
  const [aspects, setAspects] = useState(DEFAULT_ASPECTS);
  const [scores, setScores] = useState({});
  const [formData, setFormData] = useState({
    tutor_id: '',
    tutor_name: '',
    admin_qc_id: '',
    admin_qc_name: '',
    period: 1,
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
    notes: ''
  });

  useEffect(() => {
    loadAspects();
  }, []);

  const loadAspects = async () => {
    try {
      const { data, error } = await supabase
        .from('QCEvaluationAspect')
        .select('*')
        .order('order_index', { ascending: true }); // Mengurutkan ascending agar Warming Up di nomor 1

      if (!error && data && data.length > 0) {
        setAspects(data);
      } else {
        setAspects(DEFAULT_ASPECTS);
      }
    } catch (err) {
      console.warn('Fallback to default QC aspects:', err);
      setAspects(DEFAULT_ASPECTS);
    }
  };

  useEffect(() => {
    if (editing) {
      setFormData({
        tutor_id: editing.tutor_id || '',
        tutor_name: editing.tutor_name || '',
        admin_qc_id: editing.admin_qc_id || '',
        admin_qc_name: editing.admin_qc_name || '',
        period: editing.period || 1,
        period_month: editing.period_month || new Date().getMonth() + 1,
        period_year: editing.period_year || new Date().getFullYear(),
        notes: editing.notes || ''
      });
      setScores(editing.aspect_scores || {});
    } else {
      setFormData({
        tutor_id: '',
        tutor_name: '',
        admin_qc_id: '',
        admin_qc_name: '',
        period: 1,
        period_month: new Date().getMonth() + 1,
        period_year: new Date().getFullYear(),
        notes: ''
      });
      setScores({});
    }
  }, [editing, open]);

  const handleScoreChange = (aspectId, val) => {
    setScores((prev) => ({ ...prev, [aspectId]: parseFloat(val) }));
  };

  const calculateFinalScore = () => {
    let totalScore = 0;
    aspects.forEach((asp) => {
      const val = scores[asp.id] !== undefined ? scores[asp.id] : 1.0;
      totalScore += (asp.weight || 0) * val;
    });
    return Math.round(totalScore);
  };

  const getGrade = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 70) return 'Fair';
    if (score >= 60) return 'Needs Improvement';
    return 'Critical';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const finalScore = calculateFinalScore();
      const finalGrade = getGrade(finalScore);

      const payload = {
        ...formData,
        evaluation_score: finalScore,
        final_grade: finalGrade,
        aspect_scores: scores,
        updated_date: new Date().toISOString(),
      };

      if (editing) {
        const { error } = await supabase.from('QCRecord').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('QC Record updated successfully');
      } else {
        payload.created_date = new Date().toISOString();
        const { error } = await supabase.from('QCRecord').insert([payload]);
        if (error) throw error;
        toast.success('QC Record created successfully');
      }

      onOpenChange(false);
      if (onSaved) onSaved();
    } catch (err) {
      toast.error('Failed to save QC record', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const currentScore = calculateFinalScore();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-chart-3" />
            {editing ? 'Edit QC Evaluation Record' : 'Add QC Evaluation Record'}
          </DialogTitle>
          <DialogDescription>
            Scoring per aspect based on lesson recording review.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tutor</Label>
              <Select
                value={formData.tutor_id}
                onValueChange={(val) => {
                  const sel = tutors.find((t) => t.id === val);
                  setFormData({ ...formData, tutor_id: val, tutor_name: sel?.full_name || sel?.name || '' });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select Tutor" /></SelectTrigger>
                <SelectContent>
                  {tutors.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name || t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>QC Evaluator</Label>
              <Select
                value={formData.admin_qc_id}
                onValueChange={(val) => {
                  const sel = admins.find((a) => a.id === val);
                  setFormData({ ...formData, admin_qc_id: val, admin_qc_name: sel?.full_name || sel?.name || '' });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select Evaluator" /></SelectTrigger>
                <SelectContent>
                  {admins.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name || a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select
                value={String(formData.period)}
                onValueChange={(val) => setFormData({ ...formData, period: parseInt(val, 10) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Period 1 (1–15)</SelectItem>
                  <SelectItem value="2">Period 2 (16–31)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={formData.period_month}
                onChange={(e) => setFormData({ ...formData, period_month: parseInt(e.target.value, 10) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Input
                type="number"
                value={formData.period_year}
                onChange={(e) => setFormData({ ...formData, period_year: parseInt(e.target.value, 10) })}
              />
            </div>
          </div>

          {/* Section Kriteria QC yang Sudah Diurutkan */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <Label className="font-semibold text-sm">Evaluation Aspects</Label>
              <span className="text-sm font-bold text-chart-3">
                Current Score: {currentScore} / 100 ({getGrade(currentScore)})
              </span>
            </div>

            <div className="space-y-2 pr-1">
              {aspects.map((asp, index) => (
                <div
                  key={asp.id}
                  className="flex items-center justify-between bg-secondary/40 border border-border/60 rounded-xl p-3 gap-3"
                >
                  <div className="space-y-0.5 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {index + 1}. {asp.name}
                    </div>
                    <div className="text-xs text-primary/80 font-semibold">
                      ({asp.weight}%)
                    </div>
                  </div>

                  <Select
                    value={String(scores[asp.id] !== undefined ? scores[asp.id] : 1.0)}
                    onValueChange={(val) => handleScoreChange(asp.id, val)}
                  >
                    <SelectTrigger className="w-36 h-9 bg-card">
                      <SelectValue placeholder="Score" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCORE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes & Feedback</Label>
            <Textarea
              rows={3}
              placeholder="Add constructive feedback for the tutor..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90 gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Record'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}