const db = globalThis.__B44_DB__ || { 
  auth: { isAuthenticated: async () => false, me: async () => null }, 
  entities: new Proxy({}, { 
    get: () => ({ 
      filter: async () => [], 
      get: async () => null, 
      create: async () => ({}), 
      update: async () => ({}), 
      delete: async () => ({}) 
    }) 
  }), 
  integrations: { Core: { UploadFile: async () => ({ file_url: '' }) } } 
};

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users, User, CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
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

export default function FeedbackFormDialog({ open, onOpenChange, editing, processTask, onSaved }) {
  const { currentUser } = useAppAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Master data
  const [tutors, setTutors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [modules, setModules] = useState([]);
  const [perfCategories, setPerfCategories] = useState([]);
  const [allFeedbackRecords, setAllFeedbackRecords] = useState([]);

  // Group progress & Smart Roster state
  const [sessionDoneCount, setSessionDoneCount] = useState(0);
  const [evaluatedNamesInSession, setEvaluatedNamesInSession] = useState([]);

  useEffect(() => {
    Promise.all([
      db.entities.CustomUser.list(),
      db.entities.CourseCategory.list(),
      db.entities.ModuleCategory.list(),
      db.entities.StudentPerformanceCategory.list(),
      db.entities.FeedbackRecord.list(),
    ]).then(([users, cats, mods, perfs, fbRecs]) => {
      setTutors(users.filter(u => u.role === 'Tutor' || u.role === 'Team Leader'));
      setCourses(cats.filter(c => c.is_active !== false));
      setModules(mods);
      setPerfCategories(perfs.filter(p => p.is_active !== false));
      setAllFeedbackRecords(fbRecs || []);
    });
  }, []);

  // Refresh feedback records each time dialog opens so Smart Roster stays accurate
  useEffect(() => {
    if (open) {
      db.entities.FeedbackRecord.list()
        .then((recs) => setAllFeedbackRecords(recs || []))
        .catch(() => {});
    }
  }, [open]);

  // Helper to match course name from processTask against master courses (instant fallback included)
  const resolveMatchedCourse = (rawCourseName, classCodeStr) => {
    const cleanRaw = (rawCourseName || '').trim();
    if (!courses.length) return cleanRaw;

    const target = cleanRaw.toLowerCase();
    if (target) {
      const exact = courses.find(c => c.name?.toLowerCase().trim() === target);
      if (exact) return exact.name;
      const partial = courses.find(
        c => target.includes(c.name?.toLowerCase().trim()) || c.name?.toLowerCase().trim().includes(target)
      );
      if (partial) return partial.name;
      return cleanRaw;
    }

    // Fallback inference from class code abbreviations (e.g. VP, PS, PP, GD, WD, RB)
    const code = (classCodeStr || '').toUpperCase();
    if (/\bVP\b/.test(code)) return courses.find(c => c.name?.toLowerCase().includes('visual'))?.name || '';
    if (/\bPS\b/.test(code)) return courses.find(c => c.name?.toLowerCase().includes('python start'))?.name || '';
    if (/\bPP\b/.test(code)) return courses.find(c => c.name?.toLowerCase().includes('python pro'))?.name || '';
    if (/\bGDJ\b/.test(code)) return courses.find(c => c.name?.toLowerCase().includes('graphic design junior'))?.name || '';
    if (/\bGD\b/.test(code)) return courses.find(c => c.name?.toLowerCase().includes('graphic'))?.name || '';
    if (/\bWD\b/.test(code)) return courses.find(c => c.name?.toLowerCase().includes('web'))?.name || '';
    if (/\bRB\b/.test(code)) return courses.find(c => c.name?.toLowerCase().includes('roblox'))?.name || '';
    return '';
  };

  // Helper to resolve numeric Month (1, 2, 3...) from task metadata, lesson number, or class history
  const resolveMonthNumber = (task, classCodeStr) => {
    if (!task) return '';

    // 1. Direct month field (supports number 1 or string "Month 1")
    if (task.month !== undefined && task.month !== null && String(task.month).trim() !== '') {
      const parsedMonth = parseInt(String(task.month).replace(/\D/g, ''), 10);
      if (!isNaN(parsedMonth) && parsedMonth > 0) return parsedMonth;
    }

    // 2. Direct lesson_number column (Lesson 4 -> Month 1, Lesson 8 -> Month 2, etc.)
    const directLesson = Number(task.lesson_number);
    if (!isNaN(directLesson) && directLesson > 0) {
      return Math.ceil(directLesson / 4);
    }

    // 3. Scan notes or class_name for "Lesson X"
    const textToScan = `${task.notes || ''} ${task.class_name || ''}`;
    const match = textToScan.match(/lesson\s*#?\s*(\d+)/i);
    if (match) {
      const lessonNum = parseInt(match[1], 10);
      if (!isNaN(lessonNum) && lessonNum > 0) {
        return Math.ceil(lessonNum / 4);
      }
    }

    // 4. Fallback: count distinct past evaluated months for this class_code
    const code = (classCodeStr || '').toLowerCase().trim();
    if (code && allFeedbackRecords.length > 0) {
      const pastMonths = new Set(
        allFeedbackRecords
          .filter(r => (r.class_code || '').toLowerCase().trim() === code && Number(r.month) > 0)
          .map(r => Number(r.month))
      );
      return pastMonths.size + 1;
    }

    return 1;
  };

  useEffect(() => {
    if (!open) return;

    if (editing) {
      const norm = { ...EMPTY_FORM, ...editing };
      if (norm.course_name && norm.course_category_id !== norm.course_name) {
        norm.course_category_id = norm.course_name;
      }
      setForm(norm);
      setSessionDoneCount(0);
      setEvaluatedNamesInSession([]);
    } else if (processTask) {
      const resolvedClassCode = String(processTask.class_code || processTask.class_name || '').trim();
      const matchedCourse = resolveMatchedCourse(processTask.course_name, resolvedClassCode);
      const resolvedMonth = resolveMonthNumber(processTask, resolvedClassCode);

      let autoTopic = '';
      let autoKeyResult = '';
      let autoNewSkills = '';

      if (matchedCourse && resolvedMonth) {
        const mod = modules.find(
          m => m.course_name?.toLowerCase().trim() === matchedCourse.toLowerCase().trim() && Number(m.month) === Number(resolvedMonth)
        );
        if (mod) {
          autoTopic = mod.module_topic || '';
          autoKeyResult = mod.key_result || '';
          autoNewSkills = mod.new_skills || '';
        }
      }

      setForm(prev => ({
        ...EMPTY_FORM,
        student_name: prev.student_name && evaluatedNamesInSession.length > 0 ? prev.student_name : '',
        class_code: resolvedClassCode,
        course_category_id: matchedCourse,
        course_name: matchedCourse,
        month: resolvedMonth || '',
        module_topic: autoTopic,
        key_result: autoKeyResult,
        new_skills: autoNewSkills,
        tutor_id: currentUser?.id || processTask.tutor_id || '',
        tutor_name: currentUser?.full_name || processTask.tutor_name || '',
        tutor_photo: currentUser?.photo_url || '',
        tutor_telegram: currentUser?.telegram_account || '',
      }));
      setSessionDoneCount(Number(processTask.completed_count) || 0);
      setEvaluatedNamesInSession([]);
    } else {
      // Standard "+ Add Feedback" mode
      setForm({
        ...EMPTY_FORM,
        tutor_id: currentUser?.id || '',
        tutor_name: currentUser?.full_name || '',
        tutor_photo: currentUser?.photo_url || '',
        tutor_telegram: currentUser?.telegram_account || '',
      });
      setSessionDoneCount(0);
      setEvaluatedNamesInSession([]);
    }
  }, [open, editing, processTask, currentUser, courses, modules]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleCourseChange = (courseName) => {
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

  // Course options include current selected course immediately so dropdown renders with zero lag
  const displayedCourses = useMemo(() => {
    const list = [...courses];
    if (
      form.course_category_id &&
      !list.some(c => c.name?.toLowerCase().trim() === form.course_category_id.toLowerCase().trim())
    ) {
      list.unshift({ id: 'prefilled-course', name: form.course_category_id });
    }
    return list;
  }, [courses, form.course_category_id]);

  // Filtered modules based on selected course
  const courseModules = modules.filter(
    m => m.course_name?.toLowerCase().trim() === (form.course_category_id || '').toLowerCase().trim()
  );

  // Available months include resolved form.month immediately so Month renders with zero lag
  const availableMonths = useMemo(() => {
    const monthSet = new Set(courseModules.map(m => Number(m.month)).filter(Boolean));
    if (form.month && Number(form.month) > 0) {
      monthSet.add(Number(form.month));
    }
    return [...monthSet].sort((a, b) => a - b);
  }, [courseModules, form.month]);

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

  // Smart Roster: historical students in this class_code + evaluation status for this task
  const smartRoster = useMemo(() => {
    const code = (form.class_code || '').toLowerCase().trim();
    if (!code) return [];

    const matchingRecords = allFeedbackRecords.filter(
      r => (r.class_code || '').toLowerCase().trim() === code && r.student_name?.trim()
    );

    const uniqueMap = new Map();
    matchingRecords.forEach((r) => {
      const rawName = r.student_name.trim();
      const key = rawName.toLowerCase();
      const isDoneForThisTask =
        (processTask?.id && String(r.task_id) === String(processTask.id)) ||
        evaluatedNamesInSession.includes(key);

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, { name: rawName, done: isDoneForThisTask });
      } else if (isDoneForThisTask) {
        uniqueMap.get(key).done = true;
      }
    });

    // Also include any student just saved in this session even if not in history yet
    evaluatedNamesInSession.forEach((key) => {
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          name: key.replace(/\b\w/g, (l) => l.toUpperCase()),
          done: true,
        });
      }
    });

    return Array.from(uniqueMap.values());
  }, [allFeedbackRecords, form.class_code, processTask?.id, evaluatedNamesInSession]);

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

  const totalTargetStudents = processTask ? Math.max(Number(processTask.student_count) || 1, 1) : 1;
  const remainingStudentsAfterThis = processTask
    ? Math.max(totalTargetStudents - (sessionDoneCount + 1), 0)
    : 0;

  const handleSave = async (keepOpenForNext = false) => {
    setSaving(true);
    const dateParts = (form.record_date || TODAY).split('-');
    const studentName = form.student_name.trim() || 'Student';

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
      student_name: studentName,
      presence: bakePerf(form.presence),
      involvement_difficulty: bakePerf(form.involvement_difficulty),
      task_completion: bakePerf(form.task_completion),
      record_month: dateParts[1] ? parseInt(dateParts[1]) : new Date().getMonth() + 1,
      record_year: dateParts[0] ? parseInt(dateParts[0]) : new Date().getFullYear(),
      ...(processTask?.id ? { task_id: String(processTask.id) } : {}),
      ...(editing ? {} : {
        created_by_name: currentUser?.full_name || '',
        created_by_role: currentUser?.role || '',
      }),
    };

    try {
      if (editing) {
        await db.entities.FeedbackRecord.update(editing.id, saveForm);
        setSaving(false);
        onSaved();
        return;
      }

      const created = await db.entities.FeedbackRecord.create(saveForm);

      // Send notifications
      if (currentUser?.role === 'Tutor' || currentUser?.role === 'Team Leader') {
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
        await db.entities.Notification.create({
          recipient_id: saveForm.tutor_id,
          type: 'feedback_created',
          title: 'New Student Feedback',
          message: `${currentUser?.full_name || 'Admin'} recorded feedback for your student "${saveForm.student_name}" (${saveForm.course_name || 'N/A'}, Month ${saveForm.month || '?'}).`,
          reference_id: created?.id || '',
          is_read: false,
        });
      }

      // If launched from Process button, update WeeklyFeedbackAssignment progress (x/n)
      if (processTask) {
        const newDoneCount = Math.min(sessionDoneCount + 1, totalTargetStudents);
        const isAllDone = newDoneCount >= totalTargetStudents;
        const actionAt = new Date().toISOString();
        const actionBy = currentUser?.full_name || currentUser?.name || 'Tutor';

        let updateQuery = supabase
          .from('WeeklyFeedbackAssignment')
          .update({
            completed_count: newDoneCount,
            status: isAllDone ? 'completed' : 'in_progress',
            is_done: isAllDone,
            completed_by_name: isAllDone ? actionBy : null,
            completed_at: isAllDone ? actionAt : null,
            completed_date: isAllDone ? actionAt : null,
            updated_date: actionAt,
          });

        if (processTask.id) {
          updateQuery = updateQuery.eq('id', processTask.id);
        } else {
          if (processTask.class_name) updateQuery = updateQuery.eq('class_name', processTask.class_name);
          if (processTask.week_start_date) updateQuery = updateQuery.eq('week_start_date', processTask.week_start_date);
        }

        const { error: taskUpdateErr } = await updateQuery;
        if (taskUpdateErr) {
          console.error('Failed to update WeeklyFeedbackAssignment progress:', taskUpdateErr.message);
        }

        if (keepOpenForNext && !isAllDone) {
          setSessionDoneCount(newDoneCount);
          setEvaluatedNamesInSession((prev) => [...new Set([...prev, studentName.toLowerCase()])]);
          setAllFeedbackRecords((prev) => [saveForm, ...prev]);

          // Reset only student-specific fields, keep class/course/month/module info
          setForm((prev) => ({
            ...prev,
            student_name: '',
            point: 0,
            project_link: '',
            presence: '',
            involvement_difficulty: '',
            task_completion: '',
            tutor_note: '',
          }));

          toast.success(`Saved ${studentName}! (${newDoneCount}/${totalTargetStudents} done)`, {
            description: 'Course & module kept. Enter the next student below.',
          });
          setSaving(false);
          return;
        }
      }

      setSaving(false);
      onSaved();
    } catch (err) {
      console.error('Error saving feedback:', err);
      toast.error('Failed to save feedback: ' + (err.message || 'An unexpected error occurred'));
      setSaving(false);
    }
  };

  // Custom submit button click handler for mobile / touch screen devices
  const handleSubmitClick = (e, keepOpenForNext = false) => {
    e.preventDefault();
    if (!requiredComplete) {
      toast.error('Incomplete Form', {
        description: 'Please ensure Student Name, Course, Month, Class Code, Rating Star, Presence, Involvement, & Task Completion are filled in.',
      });
      return;
    }
    handleSave(keepOpenForNext);
  };

  const isTutorRole = ['Tutor', 'Team Leader'].includes(currentUser?.role);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Edit Feedback' : processTask ? 'Process Monthly Student Feedback' : 'Add Student Feedback'}
          </DialogTitle>
        </DialogHeader>

        {/* Process Task Banner (shown when launched via Process button) */}
        {processTask && (
          <div className="bg-primary/10 border border-primary/25 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="space-y-0.5">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                {totalTargetStudents > 1 ? (
                  <Users className="w-4 h-4 text-primary" />
                ) : (
                  <User className="w-4 h-4 text-primary" />
                )}
                <span>{processTask.class_name || processTask.class_code}</span>
                <span className="px-2 py-0.5 rounded-full bg-background/80 border border-border text-[10px]">
                  {totalTargetStudents > 1 ? `Group (${totalTargetStudents} Kids)` : 'Private (1 Kid)'}
                </span>
              </div>
              {processTask.notes && (
                <div className="text-muted-foreground">{processTask.notes}</div>
              )}
            </div>
            <div className="text-right">
              <span className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-semibold">
                Progress: {sessionDoneCount} / {totalTargetStudents}
              </span>
            </div>
          </div>
        )}

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

          {/* Student Name + Smart Roster Quick Picker */}
          <Field label="Student Name *">
            <Input 
              value={form.student_name} 
              onChange={e => set('student_name', e.target.value)} 
              placeholder="Enter student name or pick from class roster below..." 
              className="bg-muted border-border" 
            />
            {smartRoster.length > 0 && (
              <div className="pt-1.5 space-y-1.5">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-chart-3" />
                  <span>Smart Roster ({form.class_code}) — click to select student:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {smartRoster.map((st) => {
                    const isSelected = form.student_name.trim().toLowerCase() === st.name.toLowerCase();
                    return (
                      <button
                        key={st.name}
                        type="button"
                        onClick={() => set('student_name', st.name)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary font-medium'
                            : st.done
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                            : 'bg-secondary/60 text-foreground border-border hover:bg-secondary'
                        }`}
                      >
                        {st.done && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                        <span>{st.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Field>

          {/* Course Name */}
          <Field label="Course Name *">
            <Select value={form.course_category_id} onValueChange={handleCourseChange}>
              <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select course..." /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {displayedCourses.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {/* Month */}
          <Field label="Month *">
            <Select value={form.month ? String(form.month) : ''} onValueChange={v => handleMonthChange(Number(v))} disabled={!courseSelected}>
              <SelectTrigger className="bg-muted border-border disabled:opacity-50"><SelectValue placeholder={courseSelected ? 'Select month...' : 'Select course first'} /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {availableMonths.map(m => <SelectItem key={m} value={String(m)}>Month {m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {/* Class Code */}
          <Field label="Class Code *">
            <Input 
              value={form.class_code} 
              onChange={e => set('class_code', e.target.value)} 
              placeholder="Enter class code..." 
              className="bg-muted border-border" 
            />
          </Field>

          {/* Tutor Name (Auto-filled & Locked for Tutor/Team Leader Roles) */}
          <Field label="Tutor Name *">
            {isTutorRole ? (
              <Input
                value={form.tutor_name || currentUser?.full_name || ''}
                disabled
                className="bg-muted/60 border-border font-medium text-foreground cursor-not-allowed opacity-80"
              />
            ) : (
              <Select value={form.tutor_id} onValueChange={handleTutorChange}>
                <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select tutor..." /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {tutors.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Field>

          {/* Point */}
          <Field label="Point (0 – 5) *">
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
            label="Presence *"
            aspect={perfCategories.find(p => p.aspect_title?.toLowerCase().includes('presence'))}
            value={form.presence}
            onChange={v => set('presence', v)}
          />

          {/* Involvement and Difficulty */}
          <PerformancePointPicker
            label="Involvement and Difficulty *"
            aspect={perfCategories.find(p => p.aspect_title?.toLowerCase().includes('involvement'))}
            value={form.involvement_difficulty}
            onChange={v => set('involvement_difficulty', v)}
          />

          {/* Task Completion */}
          <PerformancePointPicker
            label="Task Completion *"
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

          {/* Section Action / Submit Button */}
          <div className="flex flex-col items-end gap-2 pt-2 pb-4">
            {!requiredComplete && (
              <p className="text-xs text-amber-400 text-right font-medium">
                ⚠️ Please complete all required fields (*) such as Student Name, Course, Month, Class Code, Rating Star, Presence, Involvement, & Task.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2.5 w-full sm:w-auto">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)} 
                className="border-border flex-1 sm:flex-initial"
              >
                Cancel
              </Button>

              {/* Show "Save & Next Student" if processing a Group class with remaining students */}
              {processTask && !editing && remainingStudentsAfterThis > 0 && (
                <Button
                  type="button"
                  onClick={(e) => handleSubmitClick(e, true)}
                  disabled={saving}
                  className={`flex-1 sm:flex-initial font-semibold gap-1.5 transition-all ${
                    requiredComplete
                      ? 'bg-chart-3 hover:bg-chart-3/90 text-white'
                      : 'bg-muted-foreground/30 text-muted-foreground cursor-pointer'
                  }`}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Save & Next Student ({remainingStudentsAfterThis} left)
                </Button>
              )}

              <Button 
                type="button"
                onClick={(e) => handleSubmitClick(e, false)} 
                disabled={saving} 
                className={`flex-1 sm:flex-initial font-semibold transition-all ${
                  requiredComplete ? 'bg-primary hover:bg-primary/90 text-white' : 'bg-muted-foreground/30 text-muted-foreground cursor-pointer'
                }`}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editing
                  ? 'Update'
                  : processTask
                  ? remainingStudentsAfterThis === 0
                    ? 'Save & Complete Class'
                    : 'Save & Close'
                  : 'Create'}
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