// src/components/weekly-feedback/TutorClassGroupManager.jsx
import React, { useState, useEffect } from 'react';
import { useAppAuth } from '@/lib/AppAuthContext';
import { invokeService } from '@/lib/appApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Users, User, BookOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TutorClassGroupManager({ onSelectGroup }) {
  const { currentUser } = useAppAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    group_name: '',
    class_type: 'group',
    course_category: 'Python',
    students: ['', ''], // Default 2 fields
  });
  const [saving, setSaving] = useState(false);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await invokeService('weeklyFeedbackService', { action: 'listMyGroups' });
      setGroups(res.data?.groups || []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.id) loadGroups();
  }, [currentUser?.id]);

  const handleStudentChange = (index, value) => {
    const updated = [...form.students];
    updated[index] = value;
    setForm({ ...form, students: updated });
  };

  const addStudentField = () => {
    setForm({ ...form, students: [...form.students, ''] });
  };

  const removeStudentField = (index) => {
    if (form.students.length <= 1) return;
    setForm({ ...form, students: form.students.filter((_, i) => i !== index) });
  };

  const handleSaveGroup = async () => {
    if (!form.group_name.trim()) {
      toast.error('Class group name is required');
      return;
    }
    const validStudents = form.students.filter((s) => s.trim() !== '');
    if (validStudents.length === 0) {
      toast.error('Please enter at least one student name');
      return;
    }

    setSaving(true);
    try {
      const res = await invokeService('weeklyFeedbackService', {
        action: 'saveGroup',
        group_name: form.group_name,
        class_type: form.class_type,
        course_category: form.course_category,
        student_names: validStudents,
      });

      if (res.data?.error) throw new Error(res.data.error);

      toast.success('Class group saved successfully!');
      setForm({ group_name: '', class_type: 'group', course_category: 'Python', students: ['', ''] });
      loadGroups();
    } catch (err) {
      toast.error('Failed to save class group', { description: err?.message || 'Server error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-chart-3" />
        <h3 className="font-semibold text-foreground">Manage My Class Groups</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border pt-4">
        {/* Create Group Form */}
        <div className="space-y-3 bg-secondary/30 p-4 border border-border rounded-xl">
          <div className="font-medium text-xs text-foreground flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-chart-3" /> Add New Class Group
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Group / Class Name *</Label>
            <Input
              value={form.group_name}
              onChange={(e) => setForm({ ...form, group_name: e.target.value })}
              placeholder="e.g. Group Python Kids A"
              className="bg-muted text-xs h-8"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Class Type</Label>
              <Select value={form.class_type} onValueChange={(v) => setForm({ ...form, class_type: v })}>
                <SelectTrigger className="bg-muted text-xs h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="group">Group (&gt; 1 Student)</SelectItem>
                  <SelectItem value="private">Private (1 Student)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Course</Label>
              <Select value={form.course_category} onValueChange={(v) => setForm({ ...form, course_category: v })}>
                <SelectTrigger className="bg-muted text-xs h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Scratch">Scratch</SelectItem>
                  <SelectItem value="Python">Python</SelectItem>
                  <SelectItem value="Web Development">Web Development</SelectItem>
                  <SelectItem value="Roblox">Roblox</SelectItem>
                  <SelectItem value="Design">Design</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs flex justify-between items-center">
              <span>Students ({form.students.length})</span>
              <Button type="button" size="xs" variant="ghost" onClick={addStudentField} className="text-xs h-5 px-1.5 text-chart-3">
                + Add Student
              </Button>
            </Label>
            {form.students.map((student, idx) => (
              <div key={idx} className="flex gap-1.5 items-center">
                <Input
                  value={student}
                  onChange={(e) => handleStudentChange(idx, e.target.value)}
                  placeholder={`Student Name ${idx + 1}`}
                  className="bg-muted text-xs h-8"
                />
                {form.students.length > 1 && (
                  <Button type="button" size="xs" variant="ghost" onClick={() => removeStudentField(idx)} className="h-8 w-8 p-0 text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button onClick={handleSaveGroup} disabled={saving} className="w-full bg-chart-3 text-white h-8 text-xs mt-2">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null} Save Class Group
          </Button>
        </div>

        {/* Saved Groups List */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-foreground">Saved Class Groups</div>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved class groups found.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {groups.map((g) => (
                <div key={g.id} className="bg-secondary/40 border border-border rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                      {g.class_type === 'group' ? <Users className="w-3.5 h-3.5 text-chart-3" /> : <User className="w-3.5 h-3.5 text-accent" />}
                      {g.group_name}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> {g.course_category}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Students: {Array.isArray(g.student_names) ? g.student_names.join(', ') : '—'}
                  </div>
                  {onSelectGroup && (
                    <Button size="xs" variant="outline" className="w-full h-6 text-[10px] border-border mt-1" onClick={() => onSelectGroup(g)}>
                      Use Group for Feedback
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}