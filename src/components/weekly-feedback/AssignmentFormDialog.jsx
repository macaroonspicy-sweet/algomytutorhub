import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { weekBounds } from '@/lib/workflowUtils';
import { invokeService } from '@/lib/appApi';

const NEW_CLASS = '__new__';

export default function AssignmentFormDialog({ open, onOpenChange, editing, classes = [], tutors = [], onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [classMode, setClassMode] = useState('existing');

  useEffect(() => {
    if (!open) return;
    const week = weekBounds();
    if (editing) {
      setForm({
        id: editing.id,
        week_start_date: editing.week_start_date?.slice(0, 10) || week.start,
        week_end_date: editing.week_end_date?.slice(0, 10) || week.end,
        class_key: editing.class_code || editing.class_name || '',
        new_class_name: '',
        new_class_code: '',
        new_course_name: '',
        tutor_id: editing.tutor_id || '',
        notes: editing.notes || '',
        status: editing.status || 'pending',
      });
      setClassMode('existing');
    } else {
      setForm({
        week_start_date: week.start,
        week_end_date: week.end,
        class_key: '',
        new_class_name: '',
        new_class_code: '',
        new_course_name: '',
        tutor_id: '',
        notes: '',
        status: 'pending',
      });
      setClassMode('existing');
    }
  }, [open, editing]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleStartChange = (value) => {
    setForm((f) => {
      const next = { ...f, week_start_date: value };
      const start = new Date(value + 'T00:00:00');
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        next.week_end_date = end.toISOString().slice(0, 10);
      }
      return next;
    });
  };

  const resolveClass = () => {
    if (classMode === 'new') {
      return {
        class_name: form.new_class_name?.trim() || '',
        class_code: form.new_class_code?.trim() || '',
        course_name: form.new_course_name?.trim() || '',
      };
    }
    const found = classes.find((c) => (c.class_code || c.class_name) === form.class_key);
    return {
      class_name: found?.class_name || '',
      class_code: found?.class_code || '',
      course_name: found?.course_name || '',
    };
  };

  const handleSave = async () => {
    const cls = resolveClass();
    if (!cls.class_name) {
      toast.error(classMode === 'new' ? 'Enter the class name' : 'Select a class');
      return;
    }
    if (!form.tutor_id) {
      toast.error('Select a tutor');
      return;
    }
    if (!form.week_start_date || !form.week_end_date) {
      toast.error('Week start and end are required');
      return;
    }
    if (form.week_end_date < form.week_start_date) {
      toast.error('Week end cannot be before the week start');
      return;
    }
    setSaving(true);
    try {
      const res = await invokeService('weeklyFeedbackService', {
        action: 'save',
        payload: {
          id: form.id,
          week_start_date: form.week_start_date,
          week_end_date: form.week_end_date,
          class_name: cls.class_name,
          class_code: cls.class_code,
          course_name: cls.course_name,
          tutor_id: form.tutor_id,
          notes: form.notes,
          status: form.status,
        },
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(editing ? 'Assignment updated' : 'Class assigned');
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not save assignment', { description: err?.response?.data?.error || err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">{editing ? 'Edit assignment' : 'Assign weekly class feedback'}</DialogTitle>
          <DialogDescription>One assignment per class, tutor and week.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Week start *</Label>
              <Input type="date" value={form.week_start_date || ''} onChange={(e) => handleStartChange(e.target.value)} className="bg-muted border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Week end *</Label>
              <Input type="date" value={form.week_end_date || ''} onChange={(e) => set('week_end_date', e.target.value)} className="bg-muted border-border" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-foreground/80">Class *</Label>
              <button
                type="button"
                onClick={() => setClassMode((m) => (m === 'new' ? 'existing' : 'new'))}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> {classMode === 'new' ? 'Pick existing' : 'New class'}
              </button>
            </div>
            {classMode === 'new' ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Class name" value={form.new_class_name || ''} onChange={(e) => set('new_class_name', e.target.value)} className="bg-muted border-border" />
                  <Input placeholder="Class code" value={form.new_class_code || ''} onChange={(e) => set('new_class_code', e.target.value)} className="bg-muted border-border" />
                </div>
                <Input placeholder="Course (optional)" value={form.new_course_name || ''} onChange={(e) => set('new_course_name', e.target.value)} className="bg-muted border-border" />
              </div>
            ) : (
              <Select value={form.class_key || ''} onValueChange={(v) => set('class_key', v)}>
                <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes.length === 0 && <SelectItem value="none" disabled>No classes yet</SelectItem>}
                  {classes.map((c) => (
                    <SelectItem key={c.class_code || c.class_name} value={c.class_code || c.class_name}>
                      {c.class_name}{c.course_name ? ` · ${c.course_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-[11px] text-muted-foreground">Classes come from your existing class and student records.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Tutor *</Label>
              <Select value={form.tutor_id || ''} onValueChange={(v) => set('tutor_id', v)}>
                <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select tutor" /></SelectTrigger>
                <SelectContent>
                  {tutors.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Status</Label>
              <Select value={form.status || 'pending'} onValueChange={(v) => set('status', v)}>
                <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-foreground/80">Notes</Label>
            <Textarea value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Instructions for the tutor..." className="bg-muted border-border" />
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? 'Update' : 'Assign'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}