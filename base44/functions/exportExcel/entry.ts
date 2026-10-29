import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
// Auth: platform session matched by email, or app session (actor_id + actor_token) for custom logins.
import * as XLSX from 'npm:xlsx@0.18.5';
import { resolveActor, canExportModule } from '../../shared/permissions.ts';
import { fetchAllEntities, dateKey, todayKey, norm } from '../../shared/data.ts';

function stamp(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function addSheet(wb, name, headers, rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}

function taskStatusLabel(task) {
  if (task.status === 'completed') return 'Completed';
  if (task.status === 'cancelled') return 'Cancelled';
  if (task.status === 'need_assistance') return 'Need Assistance';
  if (task.deadline && dateKey(task.deadline) < todayKey()) return 'Overdue';
  if (task.status === 'in_progress') return 'In Progress';
  return 'Pending';
}

function weeklyStatusLabel(a) {
  if (a.status === 'completed') return 'Completed';
  if (dateKey(a.week_end_date) && dateKey(a.week_end_date) < todayKey()) return 'Overdue';
  return 'Pending';
}

function periodLabel(period) {
  return Number(period) === 1 ? 'Period 1 (1-16)' : Number(period) === 2 ? 'Period 2 (17-end)' : '';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (!actor || !actor.customUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const requested = Array.isArray(body.modules) && body.modules.length ? body.modules : ['weekly_feedback'];
    const filters = body.filters || {};
    const filtered = body.mode === 'filtered';

    const modules = requested.filter((m) => canExportModule(actor, m));
    if (modules.length === 0) {
      return Response.json({ error: 'You are not authorized to export these records' }, { status: 403 });
    }

    const wb = XLSX.utils.book_new();
    const counts = {};
    const search = norm(filters.search);

    if (modules.includes('weekly_feedback')) {
      let assignments = await fetchAllEntities(base44, 'WeeklyFeedbackAssignment', {}, '-week_start_date');
      if (filtered) {
        if (filters.week_start) assignments = assignments.filter((a) => dateKey(a.week_start_date) === filters.week_start);
        if (filters.tutor_id) assignments = assignments.filter((a) => a.tutor_id === filters.tutor_id);
        if (filters.status) {
          assignments = assignments.filter((a) => weeklyStatusLabel(a).toLowerCase().replace(' ', '_') === filters.status);
        }
        if (search) {
          assignments = assignments.filter((a) =>
            norm(a.class_name).includes(search) || norm(a.class_code).includes(search)
            || norm(a.tutor_name).includes(search) || norm(a.course_name).includes(search));
        }
      }
      addSheet(wb, 'Weekly Class Feedback',
        ['Week Start', 'Week End', 'Class Name', 'Class Code', 'Course', 'Tutor Name', 'Tutor ID', 'Status', 'Notes', 'Completed At', 'Completed By', 'Created By', 'Created Date'],
        assignments.map((a) => [
          dateKey(a.week_start_date), dateKey(a.week_end_date),
          a.class_name || a.student_name || '', a.class_code || '', a.course_name || '',
          a.tutor_name || '', a.tutor_id || '', weeklyStatusLabel(a), a.notes || '',
          stamp(a.completed_at), a.completed_by_name || '', a.created_by_name || '', stamp(a.created_date),
        ]),
        [12, 12, 26, 16, 24, 24, 20, 12, 40, 20, 18, 18, 20]);
      counts.weekly_feedback = assignments.length;
    }

    if (modules.includes('tutor_tasks')) {
      let tasks = await fetchAllEntities(base44, 'TutorTask', {}, '-created_date');
      if (filtered) {
        if (filters.tutor_id) tasks = tasks.filter((t) => t.assigned_tutor_id === filters.tutor_id);
        if (filters.priority) tasks = tasks.filter((t) => t.priority === filters.priority);
        if (filters.category) tasks = tasks.filter((t) => t.category === filters.category);
        if (filters.status) {
          tasks = tasks.filter((t) => taskStatusLabel(t).toLowerCase().replace(' ', '_') === filters.status);
        }
        if (filters.deadline_from) tasks = tasks.filter((t) => dateKey(t.deadline) >= filters.deadline_from);
        if (filters.deadline_to) tasks = tasks.filter((t) => dateKey(t.deadline) && dateKey(t.deadline) <= filters.deadline_to);
        if (search) {
          tasks = tasks.filter((t) => norm(t.title).includes(search) || norm(t.assigned_tutor_name).includes(search));
        }
      }
      addSheet(wb, 'Tutor Tasks',
        ['Title', 'Category', 'Priority', 'Tutor Name', 'Tutor ID', 'Status', 'Start Date', 'Deadline', 'Class', 'Linked Feedback Week', 'Progress Notes', 'Completion Notes', 'Revision Note', 'Assigned By', 'Created Date', 'Completed At'],
        tasks.map((t) => [
          t.title || '', t.category || '', t.priority || '', t.assigned_tutor_name || '', t.assigned_tutor_id || '',
          taskStatusLabel(t), dateKey(t.start_date), dateKey(t.deadline), t.linked_class_name || '',
          t.linked_week_start_date ? `${dateKey(t.linked_week_start_date)} - ${dateKey(t.linked_week_end_date)}` : '',
          t.progress_notes || '', t.completion_notes || '', t.revision_note || '', t.assigned_by_name || '',
          stamp(t.created_date), stamp(t.completed_at),
        ]),
        [34, 18, 10, 22, 20, 14, 12, 12, 20, 24, 40, 40, 30, 18, 20, 20]);
      counts.tutor_tasks = tasks.length;

      const ids = new Set(tasks.map((t) => t.id));
      const allActivity = await fetchAllEntities(base44, 'TaskActivity', {}, '-created_date');
      const activity = allActivity.filter((a) => ids.has(a.task_id));
      const taskById = new Map(tasks.map((t) => [t.id, t]));
      addSheet(wb, 'Task History',
        ['Task Title', 'Tutor', 'Action', 'From', 'To', 'Note', 'Actor', 'Actor Role', 'When'],
        activity.map((a) => [
          taskById.get(a.task_id)?.title || '', taskById.get(a.task_id)?.assigned_tutor_name || '',
          a.action || '', a.from_status || '', a.to_status || '', a.note || '', a.actor_name || '', a.actor_role || '', stamp(a.created_date),
        ]),
        [34, 22, 18, 14, 16, 50, 20, 16, 20]);
    }

    if (modules.includes('qc_submissions')) {
      let submissions = await fetchAllEntities(base44, 'QCSubmission', {}, '-submitted_at');
      if (filtered) {
        if (filters.tutor_id) submissions = submissions.filter((s) => s.tutor_id === filters.tutor_id);
        if (filters.period && filters.period !== 'all') submissions = submissions.filter((s) => Number(s.period) === Number(filters.period));
        if (filters.record_month && filters.record_month !== 'all') submissions = submissions.filter((s) => Number(s.period_month) === Number(filters.record_month));
        if (filters.record_year && filters.record_year !== 'all') submissions = submissions.filter((s) => Number(s.period_year) === Number(filters.record_year));
        if (filters.status && filters.status !== 'all') submissions = submissions.filter((s) => s.status === filters.status);
        if (search) {
          submissions = submissions.filter((s) =>
            norm(s.tutor_name).includes(search) || norm(s.class_name).includes(search) || norm(s.task_title).includes(search));
        }
      }
      addSheet(wb, 'QC Submissions',
        ['Tutor Name', 'Tutor ID', 'Class', 'Recording URL', 'Class Date', 'Period', 'Month', 'Year', 'Status', 'Version', 'Submitted At', 'Submission Date', 'Superseded At', 'Task'],
        submissions.map((s) => [
          s.tutor_name || '', s.tutor_id || '', s.class_name || '', s.recording_url || '',
          dateKey(s.class_date), periodLabel(s.period), s.period_month ?? '', s.period_year ?? '',
          s.status === 'superseded' ? 'Superseded' : 'Submitted', s.version ?? 1,
          stamp(s.submitted_at), dateKey(s.submission_date), stamp(s.superseded_at), s.task_title || '',
        ]),
        [24, 20, 24, 52, 12, 18, 8, 8, 12, 8, 20, 14, 20, 30]);
      counts.qc_submissions = submissions.length;
    }

    if (modules.includes('qc_records')) {
      let records = await fetchAllEntities(base44, 'QCRecord', {}, '-record_date');
      if (filtered) {
        if (filters.tutor_id) records = records.filter((r) => r.tutor_id === filters.tutor_id);
        if (filters.period && filters.period !== 'all') records = records.filter((r) => Number(r.period) === Number(filters.period));
        if (filters.record_month && filters.record_month !== 'all') records = records.filter((r) => Number(r.period_month) === Number(filters.record_month));
        if (filters.record_year && filters.record_year !== 'all') records = records.filter((r) => Number(r.period_year) === Number(filters.record_year));
        if (search) records = records.filter((r) => norm(r.tutor_name).includes(search));
      }
      addSheet(wb, 'QC Records',
        ['Tutor Name', 'Tutor ID', 'Period', 'Month', 'Year', 'Evaluation Score', 'Final Grade', 'Record Date', 'Reviewed By', 'Auto Notes', 'Notes'],
        records.map((r) => [
          r.tutor_name || '', r.tutor_id || '', periodLabel(r.period), r.period_month ?? '', r.period_year ?? '',
          r.evaluation_score ?? '', r.final_grade || '', dateKey(r.record_date), r.admin_qc_name || '',
          r.auto_generated_notes || '', r.notes || '',
        ]),
        [24, 20, 18, 8, 8, 14, 18, 14, 22, 50, 50]);
      counts.qc_records = records.length;
    }

    if (modules.includes('student_feedback')) {
      let records = await fetchAllEntities(base44, 'FeedbackRecord', {}, '-created_date');
      if (filtered) {
        if (filters.tutor_id) records = records.filter((r) => r.tutor_id === filters.tutor_id);
        if (filters.course) records = records.filter((r) => r.course_name === filters.course);
        if (filters.record_month) records = records.filter((r) => String(r.record_month) === String(filters.record_month));
        if (filters.record_year) records = records.filter((r) => String(r.record_year) === String(filters.record_year));
        if (search) {
          records = records.filter((r) => norm(r.student_name).includes(search) || norm(r.class_code).includes(search));
        }
      }
      addSheet(wb, 'Student Feedback Records',
        ['Feedback Date', 'Student Name', 'Class Code', 'Course', 'Module Month', 'Module Topic', 'Key Result', 'New Skills', 'Tutor Name', 'Point', 'Tutor Note', 'Created By', 'Created Role'],
        records.map((r) => [
          dateKey(r.record_date), r.student_name || '', r.class_code || '', r.course_name || '', r.month ?? '',
          r.module_topic || '', r.key_result || '', r.new_skills || '', r.tutor_name || '', r.point ?? '',
          r.tutor_note || '', r.created_by_name || '', r.created_by_role || '',
        ]),
        [14, 24, 14, 26, 12, 30, 30, 30, 22, 8, 40, 20, 18]);
      counts.student_feedback = records.length;
    }

    const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    const filename = `algonova-export-${todayKey()}.xlsx`;
    return Response.json({ filename, base64, counts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}