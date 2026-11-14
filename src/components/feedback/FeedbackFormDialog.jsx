import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAppAuth } from '@/lib/AppAuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UserCheck, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export default function FeedbackFormDialog({
  open,
  isOpen,
  onOpenChange,
  onClose,
  assignment,
  prefill,
  initialData,
  record,
  courses: propCourses = [],
  modules: propModules = [],
  onSaved,
  onSuccess,
}) {
  const { currentUser } = useAppAuth();
  const dialogOpen = Boolean(open ?? isOpen);

  const handleClose = (val) => {
    if (!val) {
      onOpenChange?.(false);
      onClose?.();
    } else {
      onOpenChange?.(true);
    }
  };

  const contextData = assignment || prefill || initialData || record || null;

  const [courses, setCourses] = useState(propCourses);
  const [modules, setModules] = useState(propModules);
  const [rosterStudents, setRosterStudents] = useState([]);
  const [completedStudents, setCompletedStudents] = useState([]);
  const [saving, setSaving] = useState(false);

  const [studentName, setStudentName] = useState('');
  const [className, setClassName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [lessonTopic, setLessonTopic] = useState('');
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [point, setPoint] = useState('5');
  const [feedbackText, setFeedbackText] = useState('');

  // Load courses & modules if not passed via props
  useEffect(() => {
    if (!dialogOpen) return;
    async function loadRefs() {
      if (!propCourses?.length) {
        const { data: cData } = await supabase
          .from('CourseCategory')
          .select('*')
          .order('name', { ascending: true });
        if (cData) setCourses(cData);
      }
      if (!propModules?.length) {
        const { data: mData } = await supabase
          .from('ModuleCategory')
          .select('*')
          .order('order_index', { ascending: true });
        if (mData) setModules(mData);
      }
    }
    loadRefs();
  }, [dialogOpen, propCourses, propModules]);

  // Auto-fill Class, Course, Month & Smart Roster when dialog opens
  useEffect(() => {
    if (!dialogOpen) return;

    const targetClass =
      contextData?.class_name ||
      contextData?.linked_class_name ||
      contextData?.group_title ||
      '';
    const targetCourse =
      contextData?.course_name ||
      contextData?.course ||
      '';

    let targetMonth = new Date().getMonth() + 1;
    let targetYear = new Date().getFullYear();

    if (contextData?.period_month) {
      targetMonth = Number(contextData.period_month);
    } else if (contextData?.week_start_date) {
      const d = new Date(contextData.week_start_date);
      if (!isNaN(d.getTime())) {
        targetMonth = d.getMonth() + 1;
        targetYear = d.getFullYear();
      }
    }

    if (contextData?.period_year) {
      targetYear = Number(contextData.period_year);
    }

    setClassName(targetClass);
    setCourseName(targetCourse);
    setPeriodMonth(targetMonth);
    setPeriodYear(targetYear);
    setStudentName(contextData?.student_name || '');
    setModuleName(contextData?.module_name || '');
    setLessonTopic(contextData?.lesson_topic || contextData?.notes || '');
    setPoint(String(contextData?.point || '5'));
    setFeedbackText(contextData?.feedback || contextData?.notes_detail || '');

    // Smart Roster: fetch previous students in this class
    async function loadSmartRoster() {
      if (!targetClass) {
        setRosterStudents([]);
        setCompletedStudents([]);
        return;
      }

      const { data: pastRecords } = await supabase
        .from('FeedbackRecord')
        .select('student_name, period_month, period_year')
        .ilike('class_name', targetClass.trim());

      const uniqueNames = Array.from(
        new Set((pastRecords || []).map((r) => r.student_name?.trim()).filter(Boolean))
      );

      const doneThisMonth = (pastRecords || [])
        .filter(
          (r) =>
            Number(r.period_month) === Number(targetMonth) &&
            Number(r.period_year) === Number(targetYear)
        )
        .map((r) => r.student_name?.trim().toLowerCase());

      setRosterStudents(uniqueNames);
      setCompletedStudents(doneThisMonth);

      // Auto-select first uncompleted student if available
      if (!contextData?.student_name && uniqueNames.length > 0) {
        const nextStudent =
          uniqueNames.find((n) => !doneThisMonth.includes(n.toLowerCase())) || uniqueNames[0];
        setStudentName(nextStudent);
      }
    }

    loadSmartRoster();
  }, [dialogOpen, contextData]);

  // Auto-suggest module based on selected course & lesson number
  const filteredModules = useMemo(() => {
    if (!courseName) return modules;
    const matched = modules.filter(
      (m) =>
        m.course_name?.toLowerCase().includes(courseName.toLowerCase()) ||
        courseName.toLowerCase().includes(m.course_name?.toLowerCase() || '___')
    );
    return matched.length > 0 ? matched : modules;
  }, [modules, courseName]);

  useEffect(() => {
    if (!dialogOpen || !filteredModules.length || moduleName) return;
    const lessonMatch = String(contextData?.notes || '').match(/Lesson\s*(\d+)/i);
    if (lessonMatch) {
      const lessonNum = parseInt(lessonMatch[1], 10);
      const moduleIdx = Math.max(0, Math.min(filteredModules.length - 1, Math.ceil(lessonNum / 4) - 1));
      if (filteredModules[moduleIdx]?.name) {
        setModuleName(filteredModules[moduleIdx].name);
      }
    }
  }, [dialogOpen, filteredModules, contextData, moduleName]);

  const totalTargetStudents = Math.max(Number(contextData?.student_count) || 1, 1);
  const currentCompletedCount = Number(contextData?.completed_count) || 0;
  const isGroupClass = totalTargetStudents > 1;

  const saveRecord = async (keepOpenForNext = false) => {
    if (!studentName.trim()) {
      toast.error('Please enter or select the student name');
      return;
    }
    if (!className.trim()) {
      toast.error('Class name is required');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        tutor_id: currentUser?.id || contextData?.tutor_id || null,
        tutor_name: currentUser?.full_name || contextData?.tutor_name || '',
        student_name: studentName.trim(),
        class_name: className.trim(),
        course_name: courseName.trim(),
        module_name: moduleName.trim(),
        lesson_topic: lessonTopic.trim(),
        period_month: Number(periodMonth),
        period_year: Number(periodYear),
        point: Number(point) || 5,
        feedback: feedbackText.trim(),
        updated_date: now,
      };

      if (record?.id) {
        const { error } = await supabase
          .from('FeedbackRecord')
          .update(payload)
          .eq('id', record.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('FeedbackRecord')
          .insert([{ ...payload, created_date: now }]);
        if (error) throw error;
      }

      // Update WeeklyFeedbackAssignment progress if opened from My Student Feedback
      if (assignment?.id) {
        const newCompleted = Math.min(totalTargetStudents, currentCompletedCount + 1);
        const isAllDone = newCompleted >= totalTargetStudents;

        await supabase
          .from('WeeklyFeedbackAssignment')
          .update({
            completed_count: newCompleted,
            status: isAllDone ? 'completed' : 'in_progress',
            updated_date: now,
          })
          .eq('id', assignment.id);
      }

      toast.success(`Feedback saved for ${studentName.trim()}!`);
      onSaved?.();
      onSuccess?.();

      if (keepOpenForNext) {
        const updatedDone = [...completedStudents, studentName.trim().toLowerCase()];
        setCompletedStudents(updatedDone);
        const nextRemaining = rosterStudents.find(
          (n) => !updatedDone.includes(n.toLowerCase())
        );
        setStudentName(nextRemaining || '');
        setFeedbackText('');
      } else {
        handleClose(false);
      }
    } catch (err) {
      toast.error('Failed to save feedback', { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {record?.id ? 'Edit Student Feedback' : 'Submit Student Feedback'}
          </DialogTitle>
          {assignment && (
            <p className="text-xs text-muted-foreground">
              {assignment.class_name} · Progress: {currentCompletedCount}/{totalTargetStudents} student(s)
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Smart Roster Quick-Pick */}
          {rosterStudents.length > 0 && (
            <div className="bg-secondary/40 border border-border rounded-xl p-3 space-y-2">
              <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-primary" />
                Smart Roster (Students in this class)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {rosterStudents.map((name) => {
                  const isDone = completedStudents.includes(name.toLowerCase());
                  const isSelected = studentName.trim().toLowerCase() === name.toLowerCase();
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setStudentName(name)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : isDone
                          ? 'bg-chart-3/15 text-chart-3 border border-chart-3/30'
                          : 'bg-card border border-border text-foreground hover:bg-secondary'
                      }`}
                    >
                      {isDone && <CheckCircle2 className="w-3 h-3" />}
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/80">Student Name *</label>
              <Input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Enter student full name"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/80">Class Name *</label>
              <Input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="e.g. MY 1-1 GDJ 058"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/80">Course</label>
              {courses.length > 0 ? (
                <Select value={courseName} onValueChange={setCourseName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courseName && !courses.some((c) => c.name === courseName) && (
                      <SelectItem value={courseName}>{courseName}</SelectItem>
                    )}
                    {courses.map((c) => (
                      <SelectItem key={c.id || c.name} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="Course name"
                />
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/80">Module / Unit</label>
              {filteredModules.length > 0 ? (
                <Select value={moduleName} onValueChange={setModuleName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select module" />
                  </SelectTrigger>
                  <SelectContent>
                    {moduleName && !filteredModules.some((m) => m.name === moduleName) && (
                      <SelectItem value={moduleName}>{moduleName}</SelectItem>
                    )}
                    {filteredModules.map((m) => (
                      <SelectItem key={m.id || m.name} value={m.name}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={moduleName}
                  onChange={(e) => setModuleName(e.target.value)}
                  placeholder="Module name"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/80">Month</label>
              <Select
                value={String(periodMonth)}
                onValueChange={(v) => setPeriodMonth(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/80">Year</label>
              <Select
                value={String(periodYear)}
                onValueChange={(v) => setPeriodYear(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2027">2027</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/80">Rating (1–5)</label>
              <Select value={String(point)} onValueChange={setPoint}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 - Excellent</SelectItem>
                  <SelectItem value="4">4 - Good</SelectItem>
                  <SelectItem value="3">3 - Average</SelectItem>
                  <SelectItem value="2">2 - Needs Help</SelectItem>
                  <SelectItem value="1">1 - Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground/80">Lesson / Topic</label>
            <Input
              value={lessonTopic}
              onChange={(e) => setLessonTopic(e.target.value)}
              placeholder="e.g. Lesson 4 - Project Review"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground/80">Student Progress & Feedback</label>
            <textarea
              rows={4}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Write student progress, strengths, and areas to improve..."
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={saving}
            >
              Cancel
            </Button>

            {isGroupClass && currentCompletedCount + 1 < totalTargetStudents && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => saveRecord(true)}
                disabled={saving}
                className="gap-1.5"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                Save & Next Student
              </Button>
            )}

            <Button
              type="button"
              onClick={() => saveRecord(false)}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 gap-1.5"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Feedback
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}