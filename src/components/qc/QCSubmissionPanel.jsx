import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAppAuth } from '@/lib/AppAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, Link as LinkIcon, Calendar, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function QCSubmissionPanel() {
  const { currentUser } = useAppAuth();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Auto-detect periode berdasarkan tanggal hari ini
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentDay = new Date().getDate();
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const defaultPeriod = currentDay <= 15 ? 1 : 2;

  const [formData, setFormData] = useState({
    submission_date: todayStr,
    period_number: defaultPeriod,
    period_month: currentMonth,
    period_year: currentYear,
    recording_url: '',
    notes: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.recording_url.trim()) {
      toast.error('Please provide a recording or document playlist URL');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        tutor_id: currentUser?.id,
        tutor_name: currentUser?.full_name || currentUser?.name || 'Tutor',
        submission_date: formData.submission_date,
        period_number: formData.period_number,
        period_month: formData.period_month,
        period_year: formData.period_year,
        recording_url: formData.recording_url.trim(),
        notes: formData.notes.trim(),
        status: 'pending',
        created_date: new Date().toISOString(),
      };

      const { error } = await supabase.from('QCRecord').insert([payload]);
      if (error) throw error;

      toast.success('QC submission sent successfully');
      setSubmitted(true);
      setFormData({
        submission_date: todayStr,
        period_number: defaultPeriod,
        period_month: currentMonth,
        period_year: currentYear,
        recording_url: '',
        notes: '',
      });
    } catch (err) {
      console.error('Error submitting QC:', err);
      toast.error('Failed to submit QC', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">QC Submission</h2>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-secondary/60 px-3 py-1 rounded-full">
          <Calendar className="w-3.5 h-3.5 text-primary" />
          <span>Assigned period: <strong>Period {formData.period_number} ({formData.period_number === 1 ? '1–15' : '16–31'}) · {formData.period_month}/{formData.period_year}</strong></span>
        </div>
      </div>

      {submitted ? (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-sm text-emerald-300 font-medium">
              Your QC submission for this period has been recorded!
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSubmitted(false)} className="text-xs text-emerald-400 hover:text-emerald-300">
            Submit another
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground/80 flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-muted-foreground" /> Recording / Document Playlist URL *
            </Label>
            <Input
              required
              type="url"
              placeholder="https://drive.google.com/drive/folders/... or Youtube Playlist Link"
              value={formData.recording_url}
              onChange={(e) => setFormData({ ...formData, recording_url: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground/80">Notes (optional)</Label>
            <Textarea
              rows={2}
              placeholder="Add any context or notes for the QC reviewer..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90 gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit QC Recording
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}