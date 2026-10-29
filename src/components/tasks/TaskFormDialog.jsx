import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { TASK_CATEGORIES, TASK_PRIORITIES, weekBounds } from '@/lib/workflowUtils';
import { invokeService } from '@/lib/appApi';

const EMPTY = {
  title: '', description: '', category: 'Student Feedback', priority: 'Medium',
  start_date: '', deadline: '', tutor_ids: [], linked: false, linked_week_start_date: '', linked_week_end_date: '',
  linked_class_name: '',
};

export default function TaskFormDialog({ open, onOpenChange, tutors, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [tutorSearch, setTutorSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    const week = weekBounds();
    setForm({ ...EMPTY, start_date: new Date().toISOString().slice(0, 10), linked_week_start_date: week.start, linked_week_end_date: week.end });
    setTutorSearch('');
  }, [open]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const toggleTutor = (id) => setForm((f) => ({
    ...f,
    tutor_ids: f.tutor_ids.includes(id) ? f.tutor_ids.filter((t) => t !== id) : [...f.tutor_ids, id],
  }));

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.tutor_ids.length) { toast.error('Select at least one tutor'); return; }
    if (form.start_date && form.deadline && form.deadline < form.start_date) { toast.error('Deadline cannot be before the start date'); return; }
    setSaving(true);
    try {
      const res = await invokeService('taskService', {
        action: 'create',
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        start_date: form.start_date,
        deadline: form.deadline,
        tutor_ids: form.tutor_ids,
        linked_week_start_date: form.linked ? form.linked_week_start_date : '',
        linked_week_end_date: form.linked ? form.linked_week_end_date : '',
        linked_class_name: form.category === 'QC Submission' ? form.linked_class_name : '',
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(`Task assigned to ${res.data.created} tutor${res.data.created === 1 ? '' : 's'}`);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not assign task', { description: err?.response?.data?.error || err.message });
    } finally {
      setSaving(false);
    }
  };

  const visibleTutors = tutors.filter((t) => t.full_name?.toLowerCase().includes(tutorSearch.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Assign a task</DialogTitle>
          <DialogDescription>One task is created for each selected tutor, each with its own status and history.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm text-foreground/80">Title *</Label>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Complete Weekly Student Feedback by Friday" className="bg-muted border-border" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-foreground/80">Instructions</Label>
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="What needs to be done..." className="bg-muted border-border" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Category</Label>
              <Select value={form.category} onValueChange={(v) => set('category', v)}>
                <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
                <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {form.category === 'QC Submission' && (
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Class</Label>
              <Input
                value={form.linked_class_name}
                onChange={(e) => set('linked_class_name', e.target.value)}
                placeholder="e.g. Class Algebra A — the tutor only enters the recording link"
                className="bg-muted border-border"
              />
              <p className="text-[11px] text-muted-foreground">
                The submission is tied to this class, so duplicate recordings for the same class and period are blocked.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Start date</Label>
              <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} className="bg-muted border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Deadline</Label>
              <Input type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} className="bg-muted border-border" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-foreground/80">Assign to *</Label>
            <Input value={tutorSearch} onChange={(e) => setTutorSearch(e.target.value)} placeholder="Search tutors..." className="bg-muted border-border h-9" />
            <div className="max-h-44 overflow-y-auto border border-border rounded-xl divide-y divide-border">
              {visibleTutors.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground">No tutors found.</div>}
              {visibleTutors.map((t) => (
                <label key={t.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-secondary/40">
                  <Checkbox checked={form.tutor_ids.includes(t.id)} onCheckedChange={() => toggleTutor(t.id)} />
                  <span className="text-sm text-foreground">{t.full_name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{t.role}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{form.tutor_ids.length} selected</p>
          </div>

          <div className="bg-secondary/40 border border-border rounded-xl p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={form.linked} onCheckedChange={(v) => set('linked', !!v)} />
              <span className="text-sm text-foreground flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Link to a weekly feedback week</span>
            </label>
            {form.linked && (
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" value={form.linked_week_start_date} onChange={(e) => set('linked_week_start_date', e.target.value)} className="bg-muted border-border" />
                <Input type="date" value={form.linked_week_end_date} onChange={(e) => set('linked_week_end_date', e.target.value)} className="bg-muted border-border" />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Completing this task does not mark the student feedback assignments as completed.</p>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Assign task
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}