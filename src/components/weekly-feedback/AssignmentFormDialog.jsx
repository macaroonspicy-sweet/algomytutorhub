import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AssignmentFormDialog({ open, onOpenChange, editing, tutors = [], courses = [], onSaved }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    class_name: '',
    course_name: '',
    tutor_id: '',
    tutor_name: '',
    student_count: 1,
    week_start_date: new Date().toISOString().slice(0, 10),
    week_end_date: new Date().toISOString().slice(0, 10),
    status: 'pending',
    notes: ''
  });

  useEffect(() => {
    if (editing) {
      setFormData({
        class_name: editing.class_name || '',
        course_name: editing.course_name || '',
        tutor_id: editing.tutor_id || '',
        tutor_name: editing.tutor_name || '',
        student_count: editing.student_count || 1,
        week_start_date: editing.week_start_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        week_end_date: editing.week_end_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        status: editing.status || 'pending',
        notes: editing.notes || ''
      });
    } else {
      setFormData({
        class_name: '',
        course_name: '',
        tutor_id: '',
        tutor_name: '',
        student_count: 1,
        week_start_date: new Date().toISOString().slice(0, 10),
        week_end_date: new Date().toISOString().slice(0, 10),
        status: 'pending',
        notes: ''
      });
    }
  }, [editing, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        updated_date: new Date().toISOString(),
      };

      if (editing) {
        const { error } = await supabase.from('WeeklyFeedbackAssignment').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Assignment updated');
      } else {
        payload.created_date = new Date().toISOString();
        const { error } = await supabase.from('WeeklyFeedbackAssignment').insert([payload]);
        if (error) throw error;
        toast.success('Assignment created');
      }

      onOpenChange(false);
      if (onSaved) onSaved();
    } catch (err) {
      toast.error('Failed to save assignment', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const DEFAULT_COURSES = [
    'Visual Programming',
    'Python Start',
    'Python Pro',
    'Graphic Design',
    'AI & Data Science',
    'Web Development',
    'Roblox Game Design'
  ];

  const courseOptions = [...new Set([...courses, ...DEFAULT_COURSES])];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Assignment' : 'Add Weekly Feedback Assignment'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Class Name</Label>
            <Input
              required
              placeholder="e.g. MY 1-1 VP 020"
              value={formData.class_name}
              onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Course Name</Label>
            <Select
              value={formData.course_name}
              onValueChange={(val) => setFormData({ ...formData, course_name: val })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select course" />
              </SelectTrigger>
              <SelectContent>
                {courseOptions.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tutor</Label>
              <Select
                value={formData.tutor_id}
                onValueChange={(val) => {
                  const sel = tutors.find((t) => t.id === val);
                  setFormData({
                    ...formData,
                    tutor_id: val,
                    tutor_name: sel?.full_name || sel?.name || ''
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tutor" />
                </SelectTrigger>
                <SelectContent>
                  {tutors.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name || t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Student Count (Private/Group)</Label>
              <Input
                type="number"
                min={1}
                value={formData.student_count}
                onChange={(e) => setFormData({ ...formData, student_count: parseInt(e.target.value, 10) || 1 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Week Start</Label>
              <Input
                type="date"
                value={formData.week_start_date}
                onChange={(e) => setFormData({ ...formData, week_start_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Week End</Label>
              <Input
                type="date"
                value={formData.week_end_date}
                onChange={(e) => setFormData({ ...formData, week_end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editing ? 'Save Changes' : 'Create Assignment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}