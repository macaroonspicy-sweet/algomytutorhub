const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import StarPointInput from './StarPointInput';
import PerformancePointPicker from './PerformancePointPicker';
import { useAppAuth } from '@/lib/AppAuthContext';

const TODAY = new Date().toISOString().split('T')[0];

const EMPTY_FORM = {
  student_name: '',
  course_category_id: '',
  course_name: '',
  month: '',
  class_code: '',
  tutor_id: '',
  tutor_name: '',
  tutor_photo: '',
  tutor_telegram: '',
  point: 0,
  project_link: '',
  module_topic: '',
  key_result: '',
  new_skills: '',
  presence: '',
  involvement_difficulty: '',
  task_completion: '',
  tutor_note: '',
  record_date: TODAY,
  record_month: new Date().getMonth() + 1,
  record_year: new Date().getFullYear(),
};

export default function FeedbackFormDialog({ open, onOpenChange, editing, onSaved }) {
  const { currentUser } = useAppAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Master data
  const [tutors, setTutors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [modules, setModules] = useState([]);
  const [perfCategories, setPerfCategories] = useState([]);

  useEffect(() => {
    Promise.all([
      db.entities.CustomUser.list(),
      db.entities.CourseCategory.list(),
      db.entities.ModuleCategory.list(),
      db.entities.StudentPerformanceCategory.list(),
    ]).then(([users, cats, mods, perfs]) => {
      setTutors(users.filter(u => u.role === 'Tutor' || u.role === 'Team Leader'));
      setCourses(cats.filter(c => c.is_active !== false));
      setModules(mods);
      setPerfCategories(perfs.filter(p => p.is_active !== false));
    });
  }, []);

  useEffect(() => {
    if (open) {
      if (editing) {
        const norm = { ...EMPTY_FORM, ...editing };
        // Normalize legacy ID-based course_category_id to the course name
        if (norm.course_name && norm.course_category_id !== norm.course_name) {
          norm.course_category_id = norm.course_name;
        }
        setForm(norm);
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [open, editing]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleCourseChange = (courseName) => {
    const course = courses.find(c => c.name === courseName);
    setForm(f => ({
      ...f,
      course_category_id: courseName,
      course_name: courseName,
      month: '',
      module_topic: '',
      key_result: '',
      new_skills: '',
    }));
  };

  const handleTutorChange = (id) => {
    const t = tutors.find(u => u.id === id);
    if (t) setForm(f => ({ ...f, tutor_id: id, tutor_name: t.full_name, tutor_photo: t.photo_url || '', tutor_telegram: t.telegram_account || '' }));
  };

  // Filtered modules by selected course
  const courseModules = modules.filter(m => m.course_name === form.course_category_id);
  const availableMonths = [...new Set(courseModules.map(m => m.month).filter(Boolean))].sort((a, b) => a - b);
  const moduleTopics = [...new Set(courseModules.map(m => m.module_topic).filter(Boolean))];
  const keyResults = [...new Set(courseModules.map(m => m.key_result).filter(Boolean))];
  const newSkillsList = [...new Set(courseModules.map(m => m.new_skills).filter(Boolean))];

  const handleMonthChange = (monthNum) => {
    const mod = courseModules.find(m => Number(m.month) === Number(monthNum));
    setForm(f => ({
      ...f,
      month: monthNum,
      module_topic: mod?.module_topic || '',
      key_result: mod?.key_result || '',
      new_skills: mod?.new_skills || '',
    }));
  };

  const courseSelected = !!form.course_category_id;

  const requiredComplete =
    !!form.student_name?.trim() &&
    !!form.course_category_id &&
    !!form.month &&
    !!form.class_code?.trim() &&
    !!form.tutor_id &&
    Number(form.point) > 0 &&
    !!form.presence &&
    !!form.involvement_difficulty &&
    !!form.task_completion;

  const handleSave = async () => {
    setSaving(true);
    // Parse record_date to month/year for filtering
    const dateParts = (form.record_date || TODAY).split('-');
    const studentName = form.student_name || 'Student';
    // Bake the student name into the performance description (replaces "(Student Name)" placeholder)
    const bakePerf = (val) => {
      if (!val || !val.includes('::')) return val;
      const parts = val.split('::');
      const aspectKey = parts[0];
      const pointNum = parseInt(parts[1]);
      const aspect = perfCategories.find(a => a.aspect_title === aspectKey || a.id === aspectKey);
      const template = aspect?.[`point_${pointNum}_description`];
      if (!template) return val;
      const baked = template.replace(/\(Student Name\)/gi, studentName).replace(/\[Student Name\]/gi, studentName);
      return `${aspect.aspect_title}::${pointNum}::${baked}`;
    };
    const saveForm = {
      ...form,
      presence: bakePerf(form.presence),
      involvement_difficulty: bakePerf(form.involvement_difficulty),
      task_completion: bakePerf(form.task_completion),
      record_month: dateParts[1] ? parseInt(dateParts[1]) : new Date().getMonth() + 1,
      record_year: dateParts[0] ? parseInt(dateParts[0]) : new Date().getFullYear(),
      ...(editing ? {} : {
        created_by_name: currentUser?.full_name || '',
        created_by_role: currentUser?.role || '',
      }),
    };
    if (editing) {
      await db.entities.FeedbackRecord.update(editing.id, saveForm);
    } else {
      const created = await db.entities.FeedbackRecord.create(saveForm);
      if (currentUser?.role === 'Tutor' || currentUser?.role === 'Team Leader') {
        // Tutor / Team Leader submitted feedback → notify admin roles
        const admins = await db.entities.CustomUser.filter({ is_active: true });
        const adminUsers = admins.filter(u => ['Head of Retention', 'Head of Tutor', 'QC Team', 'Feedback Team'].includes(u.role));
        await Promise.all(adminUsers.map(admin =>
          db.entities.Notification.create({
            recipient_id: admin.id,
            type: 'feedback_created',
            title: 'New Student Feedback',
            message: `${currentUser.full_name} submitted feedback for student "${saveForm.student_name}" (${saveForm.course_name || 'N/A'}, Month ${saveForm.month || '?'}).`,
            reference_id: created?.id || '',
            is_read: false,
          })
        ));
      } else if (saveForm.tutor_id) {
        // Non-Tutor recorded feedback → notify ONLY the assigned tutor (not broadcast to all tutors)
        await db.entities.Notification.create({
          recipient_id: saveForm.tutor_id,
          type: 'feedback_created',
          title: 'New Student Feedback',
          message: `${currentUser?.full_name || 'Admin'} recorded feedback for your student "${saveForm.student_name}" (${saveForm.course_name || 'N/A'}, Month ${saveForm.month || '?'}).`,
          reference_id: created?.id || '',
          is_read: false,
        });
      }
    }
    setSaving(false);
    onSaved();
  };

  const visibleTutors = currentUser?.role === 'Tutor' ? tutors.filter(t => t.id === currentUser.id) : tutors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Feedback' : 'Add Student Feedback'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">

          {/* Record Date */}
          <Field label="Record Date">
            <Input
              type="date"
              value={form.record_date || TODAY}
              onChange={e => set('record_date', e.target.value)}
              className="bg-muted border-border"
            />
          </Field>

          {/* Student Name */}
          <Field label="Student Name">
            <Input value={form.student_name} onChange={e => set('student_name', e.target.value)} placeholder="Enter student name..." className="bg-muted border-border" />
          </Field>

          {/* Course Name */}
          <Field label="Course Name">
            <Select value={form.course_category_id} onValueChange={handleCourseChange}>
              <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select course..." /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {courses.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {/* Month */}
          <Field label="Month">
            <Select value={form.month ? String(form.month) : ''} onValueChange={v => handleMonthChange(Number(v))} disabled={!courseSelected}>
              <SelectTrigger className="bg-muted border-border disabled:opacity-50"><SelectValue placeholder={courseSelected ? 'Select month...' : 'Select course first'} /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {availableMonths.map(m => <SelectItem key={m} value={String(m)}>Month {m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {/* Class Code */}
          <Field label="Class Code">
            <Input value={form.class_code} onChange={e => set('class_code', e.target.value)} placeholder="Enter class code..." className="bg-muted border-border" />
          </Field>

          {/* Tutor Name */}
          <Field label="Tutor Name">
            <Select value={form.tutor_id} onValueChange={handleTutorChange}>
              <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select tutor..." /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {tutors.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {/* Point */}
          <Field label="Point (0 – 5)">
            <StarPointInput value={form.point} onChange={v => set('point', v)} />
          </Field>

          {/* Project Link */}
          <Field label="Project (Link)">
            <Input value={form.project_link} onChange={e => set('project_link', e.target.value)} placeholder="https://..." className="bg-muted border-border" />
          </Field>

          {/* Module Topic */}
          <Field label="Module Topic">
            {!courseSelected ? (
              <div className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground opacity-50">Select course first</div>
            ) : (
              <div className="space-y-1.5">
                {moduleTopics.length === 0 ? (
                  <div className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground italic">No module topics available</div>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-muted/30 p-2">
                    {moduleTopics.map((t, i) => (
                      <label key={i} className={`flex items-start gap-3 rounded-lg px-3 py-2 cursor-pointer transition-all ${form.module_topic === t ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'}`}>
                        <input type="radio" name="module_topic" checked={form.module_topic === t} onChange={() => set('module_topic', t)} className="hidden" />
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 mt-0.5 ${form.module_topic === t ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
                        <span className="text-sm text-foreground leading-relaxed">{t}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Field>

          {/* Key Result */}
          <Field label="Key Result">
            {!courseSelected ? (
              <div className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground opacity-50">Select course first</div>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-muted/30 p-2">
                {keyResults.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground italic">No key results available</div>
                ) : keyResults.map((r, i) => (
                  <label key={i} className={`flex items-start gap-3 rounded-lg px-3 py-2 cursor-pointer transition-all ${form.key_result === r ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'}`}>
                    <input type="radio" name="key_result" checked={form.key_result === r} onChange={() => set('key_result', r)} className="hidden" />
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 mt-0.5 ${form.key_result === r ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
                    <span className="text-sm text-foreground leading-relaxed">{r}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>

          {/* New Skills */}
          <Field label="Abilities / Skills Acquired">
            {!courseSelected ? (
              <div className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground opacity-50">Select course first</div>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-muted/30 p-2">
                {newSkillsList.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground italic">No skills available</div>
                ) : newSkillsList.map((s, i) => (
                  <label key={i} className={`flex items-start gap-3 rounded-lg px-3 py-2 cursor-pointer transition-all ${form.new_skills === s ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'}`}>
                    <input type="radio" name="new_skills" checked={form.new_skills === s} onChange={() => set('new_skills', s)} className="hidden" />
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 mt-0.5 ${form.new_skills === s ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
                    <span className="text-sm text-foreground leading-relaxed">{s}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>

          {/* Presence */}
          <PerformancePointPicker
            label="Presence"
            aspect={perfCategories.find(p => p.aspect_title?.toLowerCase().includes('presence'))}
            value={form.presence}
            onChange={v => set('presence', v)}
          />

          {/* Involvement and Difficulty */}
          <PerformancePointPicker
            label="Involvement and Difficulty"
            aspect={perfCategories.find(p => p.aspect_title?.toLowerCase().includes('involvement'))}
            value={form.involvement_difficulty}
            onChange={v => set('involvement_difficulty', v)}
          />

          {/* Task Completion */}
          <PerformancePointPicker
            label="Task Completion"
            aspect={perfCategories.find(p => p.aspect_title?.toLowerCase().includes('task'))}
            value={form.task_completion}
            onChange={v => set('task_completion', v)}
          />

          {/* Tutor's Note */}
          <Field label="Tutor's Note">
            <textarea
              value={form.tutor_note || ''}
              onChange={e => {
                const words = e.target.value.trim() === '' ? [] : e.target.value.trim().split(/\s+/);
                if (words.length <= 200) set('tutor_note', e.target.value);
              }}
              placeholder="Write tutor's notes here..."
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground resize-none"
              style={{ minHeight: '80px', height: 'auto' }}
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              rows={3}
            />
            <div className="flex justify-between items-center mt-1">
              <p className="text-xs text-muted-foreground">Maximum 200 words allowed.</p>
              <p className={`text-xs font-medium ${
                (form.tutor_note?.trim() === '' || !form.tutor_note ? 0 : form.tutor_note.trim().split(/\s+/).length) >= 190
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              }`}>
                {form.tutor_note?.trim() === '' || !form.tutor_note ? 0 : form.tutor_note.trim().split(/\s+/).length} / 200 words
              </p>
            </div>
          </Field>

          <div className="flex flex-col items-end gap-2 pt-2">
            {!requiredComplete && (
              <p className="text-xs text-muted-foreground">Please complete all required fields (Student Name, Course, Month, Class Code, Tutor, Point, Presence, Involvement & Difficulty, Task Completion) to {editing ? 'update' : 'create'}.</p>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !requiredComplete} className="bg-primary hover:bg-primary/90">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-foreground/80">{label}</Label>
      {children}
    </div>
  );
}