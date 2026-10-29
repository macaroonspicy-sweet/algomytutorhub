const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
// Auth: platform session matched by email, or app session (actor_id + actor_token) for custom logins.
import { resolveActor, canManageTasks, canViewTaskManagement } from '../../shared/permissions.ts';
import { fetchAllEntities } from '../../shared/data.ts';

const STATUSES = ['pending', 'in_progress', 'completed', 'need_assistance', 'cancelled'];
const TUTOR_STATUSES = ['pending', 'in_progress', 'completed', 'need_assistance'];
const CATEGORIES = ['Student Feedback', 'QC Submission', 'Administration', 'Class Preparation', 'Training', 'Student Follow-up', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

async function notify(base44, payload) {
  await db.asServiceRole.entities.Notification.create({ ...payload, is_read: false });
}

async function log(base44, actor, taskId, action, extra = {}) {
  await db.asServiceRole.entities.TaskActivity.create({
    task_id: taskId,
    action,
    actor_id: actor.customUser.id,
    actor_name: actor.customUser.full_name,
    actor_role: actor.role,
    ...extra,
  });
}

async function getTask(base44, id) {
  return db.asServiceRole.entities.TutorTask.get(id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (!actor || !actor.customUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const action = body.action || 'list';
    const isTutorRole = actor.role === 'Tutor';
    const manager = canManageTasks(actor);
    const viewer = canViewTaskManagement(actor);

    if (action === 'list') {
      if (!viewer && !isTutorRole) return Response.json({ error: 'Not allowed' }, { status: 403 });
      const query = isTutorRole && !viewer ? { assigned_tutor_id: actor.customUser.id } : {};
      const items = await fetchAllEntities(base44, 'TutorTask', query, '-created_date');
      return Response.json({ items });
    }

    if (action === 'history') {
      const task = await getTask(base44, body.task_id);
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });
      if (!viewer && task.assigned_tutor_id !== actor.customUser.id) {
        return Response.json({ error: 'Not allowed' }, { status: 403 });
      }
      const page = await db.asServiceRole.entities.TaskActivity.filter({ task_id: task.id }, { sort: 'created_date', limit: 200 });
      return Response.json({ items: page?.items || [] });
    }

    if (action === 'create') {
      if (!manager) return Response.json({ error: 'Only Team Leaders can assign tasks' }, { status: 403 });
      const tutorIds = Array.isArray(body.tutor_ids) ? [...new Set(body.tutor_ids.filter(Boolean))] : [];
      if (!body.title || !String(body.title).trim()) return Response.json({ error: 'Title is required' }, { status: 400 });
      if (!tutorIds.length) return Response.json({ error: 'Select at least one tutor' }, { status: 400 });
      if (body.category && !CATEGORIES.includes(body.category)) return Response.json({ error: 'Invalid category' }, { status: 400 });
      if (body.priority && !PRIORITIES.includes(body.priority)) return Response.json({ error: 'Invalid priority' }, { status: 400 });
      if (body.start_date && body.deadline && body.deadline < body.start_date) {
        return Response.json({ error: 'Deadline cannot be before the start date' }, { status: 400 });
      }

      const usersPage = await db.asServiceRole.entities.CustomUser.filter({ id: { $in: tutorIds } }, { limit: 200 });
      const tutorMap = new Map((usersPage?.items || []).map((u) => [u.id, u]));
      const groupId = crypto.randomUUID();
      const created = [];
      for (const tutorId of tutorIds) {
        const tutor = tutorMap.get(tutorId);
        if (!tutor || !['Tutor', 'Team Leader'].includes(tutor.role)) continue;
        const task = await db.asServiceRole.entities.TutorTask.create({
          group_id: groupId,
          title: String(body.title).trim(),
          description: body.description || '',
          category: body.category || 'Other',
          priority: body.priority || 'Medium',
          start_date: body.start_date || '',
          deadline: body.deadline || '',
          status: 'pending',
          assigned_tutor_id: tutor.id,
          assigned_tutor_name: tutor.full_name,
          assigned_by_id: actor.customUser.id,
          assigned_by_name: actor.customUser.full_name,
          linked_week_start_date: body.linked_week_start_date || '',
          linked_week_end_date: body.linked_week_end_date || '',
          linked_class_name: body.linked_class_name || '',
        });
        created.push(task);
        await log(base44, actor, task.id, 'assigned', {
          to_status: 'pending',
          note: `Assigned to ${tutor.full_name}${body.deadline ? ` — deadline ${body.deadline}` : ''}`,
        });
        await notify(base44, {
          recipient_id: tutor.id,
          type: 'task_assigned',
          title: 'New task assigned',
          message: `${actor.customUser.full_name}: "${task.title}"${body.deadline ? ` — due ${body.deadline}` : ''}`,
          reference_id: task.id,
        });
      }
      if (!created.length) return Response.json({ error: 'No valid tutors selected' }, { status: 400 });
      return Response.json({ created: created.length, tasks: created });
    }

    if (action === 'update') {
      if (!manager) return Response.json({ error: 'Only Team Leaders can change tasks' }, { status: 403 });
      const task = await getTask(base44, body.task_id);
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });
      const fields = body.fields || {};
      const patch = {};
      const notes = [];

      ['title', 'description'].forEach((key) => {
        if (fields[key] !== undefined) patch[key] = String(fields[key]);
      });
      if (fields.category !== undefined) {
        if (!CATEGORIES.includes(fields.category)) return Response.json({ error: 'Invalid category' }, { status: 400 });
        patch.category = fields.category;
      }
      if (fields.priority !== undefined) {
        if (!PRIORITIES.includes(fields.priority)) return Response.json({ error: 'Invalid priority' }, { status: 400 });
        patch.priority = fields.priority;
      }
      ['start_date'].forEach((key) => {
        if (fields[key] !== undefined) patch[key] = fields[key];
      });
      if (fields.deadline !== undefined && fields.deadline !== task.deadline) {
        patch.deadline = fields.deadline;
        notes.push(`Deadline changed from ${task.deadline || '—'} to ${fields.deadline || '—'}`);
        await log(base44, actor, task.id, 'deadline_changed', { note: notes[notes.length - 1] });
      }
      if (fields.status !== undefined && fields.status !== task.status) {
        if (!STATUSES.includes(fields.status)) return Response.json({ error: 'Invalid status' }, { status: 400 });
        patch.status = fields.status;
        patch.completed_at = fields.status === 'completed' ? new Date().toISOString() : '';
        await log(base44, actor, task.id, task.status === 'completed' ? 'reopened' : 'status_changed', {
          from_status: task.status, to_status: fields.status,
        });
      }

      if (body.tutor_id && body.tutor_id !== task.assigned_tutor_id) {
        const tutor = await db.asServiceRole.entities.CustomUser.get(body.tutor_id)
          .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
        if (!tutor || !['Tutor', 'Team Leader'].includes(tutor.role)) {
          return Response.json({ error: 'Tutor not found' }, { status: 400 });
        }
        patch.assigned_tutor_id = tutor.id;
        patch.assigned_tutor_name = tutor.full_name;
        await log(base44, actor, task.id, 'reassigned', { note: `Reassigned from ${task.assigned_tutor_name} to ${tutor.full_name}` });
        await notify(base44, {
          recipient_id: tutor.id, type: 'task_assigned', title: 'Task assigned to you',
          message: `"${task.title}" was assigned to you by ${actor.customUser.full_name}.`, reference_id: task.id,
        });
        await notify(base44, {
          recipient_id: task.assigned_tutor_id, type: 'task_updated', title: 'Task reassigned',
          message: `"${task.title}" was reassigned to ${tutor.full_name}.`, reference_id: task.id,
        });
      }

      if (body.revision_note) {
        patch.revision_requested = true;
        patch.revision_note = body.revision_note;
        if (task.status !== 'completed') patch.status = 'in_progress';
        await log(base44, actor, task.id, 'revision_requested', { note: body.revision_note });
        await notify(base44, {
          recipient_id: task.assigned_tutor_id, type: 'task_updated', title: 'Revision requested',
          message: `"${task.title}": ${body.revision_note}`, reference_id: task.id,
        });
      }

      if (body.comment) {
        await log(base44, actor, task.id, 'comment', { note: body.comment });
        await notify(base44, {
          recipient_id: task.assigned_tutor_id, type: 'task_updated', title: 'Comment on your task',
          message: `"${task.title}": ${body.comment}`, reference_id: task.id,
        });
      }

      if (Object.keys(patch).length) {
        const updated = await db.asServiceRole.entities.TutorTask.update(task.id, patch);
        if (body.revision_note) {
          await db.asServiceRole.entities.TutorTask.update(task.id, { revision_requested: true, revision_note: body.revision_note });
        }
        if (patch.deadline !== undefined && task.assigned_tutor_id) {
          await notify(base44, {
            recipient_id: task.assigned_tutor_id, type: 'task_updated', title: 'Deadline updated',
            message: `"${updated.title}" — new deadline ${patch.deadline || '—'}.`, reference_id: task.id,
          });
        }
        if (patch.status && ['pending', 'in_progress'].includes(patch.status) && task.status === 'completed') {
          await notify(base44, {
            recipient_id: task.assigned_tutor_id, type: 'task_updated', title: 'Task reopened',
            message: `"${updated.title}" was reopened by ${actor.customUser.full_name}.`, reference_id: task.id,
          });
        }
        return Response.json({ task: updated });
      }
      return Response.json({ task });
    }

    if (action === 'updateMine') {
      const task = await getTask(base44, body.task_id);
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });
      const isOwner = task.assigned_tutor_id === actor.customUser.id;
      if (!isOwner && !manager) return Response.json({ error: 'Not allowed' }, { status: 403 });

      const patch = {};
      if (body.status !== undefined) {
        if (!TUTOR_STATUSES.includes(body.status)) return Response.json({ error: 'Invalid status' }, { status: 400 });
        if (body.status !== task.status) {
          patch.status = body.status;
          patch.completed_at = body.status === 'completed' ? new Date().toISOString() : '';
          await log(base44, actor, task.id, 'status_changed', {
            from_status: task.status, to_status: body.status, note: body.progress_notes || body.completion_notes || '',
          });
        }
      }
      if (body.progress_notes !== undefined) patch.progress_notes = body.progress_notes;
      if (body.completion_notes !== undefined) patch.completion_notes = body.completion_notes;
      if (patch.status === 'completed' && body.completion_notes !== undefined) {
        await log(base44, actor, task.id, 'comment', { note: body.completion_notes });
      }
      if (!Object.keys(patch).length) return Response.json({ task });
      const updated = await db.asServiceRole.entities.TutorTask.update(task.id, patch);
      if (patch.status && ['completed', 'need_assistance'].includes(patch.status) && task.assigned_by_id) {
        await notify(base44, {
          recipient_id: task.assigned_by_id,
          type: 'task_status',
          title: patch.status === 'completed' ? 'Task completed' : 'Tutor needs assistance',
          message: `${actor.customUser.full_name} — "${task.title}".`,
          reference_id: task.id,
        });
      }
      return Response.json({ task: updated });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}