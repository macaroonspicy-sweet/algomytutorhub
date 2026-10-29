const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
// Auth: platform session matched by email, or app session (actor_id + actor_token) for custom logins.
import { resolveActor, canReviewQCSubmissions, canSubmitQC } from '../../shared/permissions.ts';
import { fetchAllEntities, norm, todayKey } from '../../shared/data.ts';
import { qcPeriodFor } from '../../shared/qcPeriod.ts';

function isValidUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function applyFilters(items, filters = {}) {
  const search = norm(filters.search);
  return items.filter((s) => {
    if (filters.tutor_id && s.tutor_id !== filters.tutor_id) return false;
    if (filters.period && filters.period !== 'all' && Number(s.period) !== Number(filters.period)) return false;
    if (filters.month && filters.month !== 'all' && Number(s.period_month) !== Number(filters.month)) return false;
    if (filters.year && filters.year !== 'all' && Number(s.period_year) !== Number(filters.year)) return false;
    if (filters.status && filters.status !== 'all' && s.status !== filters.status) return false;
    if (search) {
      const haystack = `${s.tutor_name || ''} ${s.class_name || ''} ${s.task_title || ''} ${s.recording_url || ''}`;
      if (!norm(haystack).includes(search)) return false;
    }
    return true;
  });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (!actor || !actor.customUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const action = body.action || 'mine';
    const me = actor.customUser;

    if (action === 'submit') {
      if (!canSubmitQC(actor)) return Response.json({ error: 'Only tutors can submit class recordings' }, { status: 403 });

      const recordingUrl = String(body.recording_url || '').trim();
      if (!recordingUrl) return Response.json({ error: 'Recording or document URL is required' }, { status: 400 });
      if (!isValidUrl(recordingUrl)) {
        return Response.json({ error: 'Enter a valid link starting with https:// or http://' }, { status: 400 });
      }

      const classDateInput = String(body.class_date || '').trim();
      const period = qcPeriodFor(classDateInput || todayKey());
      if (!period) return Response.json({ error: 'Class date is not a valid date' }, { status: 400 });

      let task = null;
      if (body.task_id) {
        task = await db.asServiceRole.entities.TutorTask.get(body.task_id)
          .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });
        if (task.assigned_tutor_id !== me.id) return Response.json({ error: 'This task is not yours' }, { status: 403 });
      }

      const className = String(body.class_name || task?.linked_class_name || '').trim() || 'Unspecified class';
      const targetKey = norm(className);

      const all = await fetchAllEntities(base44, 'QCSubmission', { tutor_id: me.id }, '-submitted_at');
      const samePeriod = all.filter((s) => s.status === 'submitted'
        && Number(s.period) === period.period
        && Number(s.period_month) === period.period_month
        && Number(s.period_year) === period.period_year
        && norm(s.class_name) === targetKey);

      if (samePeriod.some((s) => norm(s.recording_url) === norm(recordingUrl))) {
        return Response.json({
          error: 'This recording was already submitted for that class and period',
        }, { status: 409 });
      }

      const version = Math.max(0, ...samePeriod.map((s) => Number(s.version) || 1)) + 1;
      const now = new Date().toISOString();

      // Resubmissions keep the earlier version on record with its own timestamps.
      for (const previous of samePeriod) {
        await db.asServiceRole.entities.QCSubmission.update(previous.id, {
          status: 'superseded',
          superseded_at: now,
        });
      }

      const created = await db.asServiceRole.entities.QCSubmission.create({
        tutor_id: me.id,
        tutor_name: me.full_name,
        class_name: className,
        recording_url: recordingUrl,
        class_date: period.class_date,
        submission_date: todayKey(),
        submitted_at: now,
        period: period.period,
        period_month: period.period_month,
        period_year: period.period_year,
        status: 'submitted',
        version,
        task_id: task?.id || '',
        task_title: task?.title || '',
        notes: String(body.notes || '').trim(),
      });

      // Only the task this submission belongs to is completed.
      if (task && task.status !== 'completed' && task.status !== 'cancelled') {
        await db.asServiceRole.entities.TutorTask.update(task.id, {
          status: 'completed',
          completed_at: now,
        });
        await db.asServiceRole.entities.TaskActivity.create({
          task_id: task.id,
          action: 'status_changed',
          actor_id: me.id,
          actor_name: me.full_name,
          actor_role: actor.role,
          from_status: task.status,
          to_status: 'completed',
          note: `QC submission received for ${className} — ${period.period_label}`,
        });
        if (task.assigned_by_id) {
          await db.asServiceRole.entities.Notification.create({
            recipient_id: task.assigned_by_id,
            type: 'task_status',
            title: 'QC submission received',
            message: `${me.full_name} submitted ${className} — ${period.period_label}.`,
            reference_id: task.id,
            is_read: false,
          });
        }
      }

      return Response.json({ record: created, period });
    }

    if (action === 'mine') {
      if (!canSubmitQC(actor) && !canReviewQCSubmissions(actor)) {
        return Response.json({ error: 'Not allowed' }, { status: 403 });
      }
      const submissions = await fetchAllEntities(base44, 'QCSubmission', { tutor_id: me.id }, '-submitted_at');
      const tasks = (await fetchAllEntities(base44, 'TutorTask', { assigned_tutor_id: me.id }, '-created_date'))
        .filter((t) => t.category === 'QC Submission' && t.status !== 'cancelled');
      return Response.json({ submissions, tasks });
    }

    if (action === 'monitoring') {
      if (!canReviewQCSubmissions(actor)) return Response.json({ error: 'Not allowed' }, { status: 403 });
      const filters = body.filters || {};
      const all = await fetchAllEntities(base44, 'QCSubmission', {}, '-submitted_at');
      const submissions = applyFilters(all, filters);
      const active = submissions.filter((s) => s.status === 'submitted');

      const tasks = (await fetchAllEntities(base44, 'TutorTask', { category: 'QC Submission' }, '-created_date'))
        .filter((t) => t.status !== 'cancelled')
        .filter((t) => {
          if (filters.tutor_id && t.assigned_tutor_id !== filters.tutor_id) return false;
          if (filters.status === 'submitted') return false;
          return true;
        });
      const submittedTaskIds = new Set(active.filter((s) => s.task_id).map((s) => s.task_id));
      const pending = tasks
        .filter((t) => !submittedTaskIds.has(t.id))
        .map((t) => ({
          task_id: t.id,
          task_title: t.title,
          tutor_id: t.assigned_tutor_id,
          tutor_name: t.assigned_tutor_name,
          class_name: t.linked_class_name || '',
          deadline: t.deadline || '',
          task_status: t.status,
        }));

      const tutorIds = new Set([...active.map((s) => s.tutor_id), ...pending.map((p) => p.tutor_id)]);
      return Response.json({
        submissions,
        pending,
        summary: {
          submissions: active.length,
          resubmissions: active.filter((s) => Number(s.version) > 1).length,
          pending: pending.length,
          tutors: tutorIds.size,
        },
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}