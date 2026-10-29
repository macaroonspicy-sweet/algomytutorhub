const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
// Auth: platform session matched by email, or app session (actor_id + actor_token) for custom logins.
import { resolveActor, canReviewWeeklyFeedback, canViewWeeklyFeedback, canManageWeeklyFeedback } from '../../shared/permissions.ts';
import { fetchAllEntities, norm } from '../../shared/data.ts';

// Class options are derived from the records the app already has: students carry a class
// code/course, and historical assignments keep the classes they were written for.
async function listClasses(base44) {
  const [students, assignments] = await Promise.all([
    fetchAllEntities(base44, 'Student', {}),
    fetchAllEntities(base44, 'WeeklyFeedbackAssignment', {}),
  ]);
  const map = new Map();
  const add = (name, code, course) => {
    const label = String(name || code || '').trim();
    const classCode = String(code || '').trim();
    const key = norm(classCode || label);
    if (!key) return;
    const existing = map.get(key);
    if (existing) {
      if (!existing.course_name && course) existing.course_name = course;
      if (!existing.class_code && classCode) existing.class_code = classCode;
      return;
    }
    map.set(key, { class_name: label, class_code: classCode, course_name: course || '' });
  };
  students.forEach((s) => {
    const code = s.class_code || '';
    add(code, code, s.course_name);
  });
  assignments.forEach((a) => add(a.class_name || a.student_name, a.class_code, a.course_name));
  return [...map.values()].sort((a, b) => a.class_name.localeCompare(b.class_name));
}

function classKey(record) {
  return norm(record.class_code || record.class_name || '');
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (!actor || !actor.customUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const action = body.action || 'list';

    if (action === 'list') {
      if (!canViewWeeklyFeedback(actor)) {
        return Response.json({ error: 'You are not authorized to view weekly feedback' }, { status: 403 });
      }
      const reviewer = canReviewWeeklyFeedback(actor);
      const query = reviewer ? {} : { tutor_id: actor.customUser.id };
      const items = await fetchAllEntities(base44, 'WeeklyFeedbackAssignment', query, '-week_start_date');
      return Response.json({ items });
    }

    if (action === 'classes') {
      if (!canViewWeeklyFeedback(actor)) return Response.json({ error: 'Not allowed' }, { status: 403 });
      return Response.json({ items: await listClasses(base44) });
    }

    if (action === 'save') {
      if (!canManageWeeklyFeedback(actor)) return Response.json({ error: 'Not allowed' }, { status: 403 });
      const p = body.payload || {};
      const className = String(p.class_name || '').trim();
      const classCode = String(p.class_code || '').trim();
      if (!className) return Response.json({ error: 'Class name is required' }, { status: 400 });
      if (!p.tutor_id) return Response.json({ error: 'A tutor is required' }, { status: 400 });
      if (!p.week_start_date || !p.week_end_date) {
        return Response.json({ error: 'Week start and end are required' }, { status: 400 });
      }
      if (p.week_end_date < p.week_start_date) {
        return Response.json({ error: 'Week end date cannot be before the start date' }, { status: 400 });
      }

      const tutor = await db.asServiceRole.entities.CustomUser.get(p.tutor_id)
        .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
      if (!tutor) return Response.json({ error: 'Tutor not found' }, { status: 400 });
      if (!['Tutor', 'Team Leader'].includes(tutor.role)) {
        return Response.json({ error: 'Selected user is not a tutor' }, { status: 400 });
      }

      // One assignment per class + tutor + week.
      const weekItems = await fetchAllEntities(base44, 'WeeklyFeedbackAssignment', { week_key: p.week_start_date });
      const targetKey = norm(classCode || className);
      const duplicate = weekItems.find((a) =>
        a.id !== p.id && a.tutor_id === tutor.id && norm(a.class_code || a.class_name) === targetKey);
      if (duplicate) {
        return Response.json({ error: 'This tutor already has feedback assigned for that class and week' }, { status: 409 });
      }

      const completed = p.status === 'completed';
      const data = {
        week_start_date: p.week_start_date,
        week_end_date: p.week_end_date,
        week_key: p.week_start_date,
        class_name: className,
        class_code: classCode,
        course_name: String(p.course_name || '').trim(),
        tutor_id: tutor.id,
        tutor_name: tutor.full_name,
        notes: p.notes || '',
        status: completed ? 'completed' : 'pending',
        completed_at: completed ? new Date().toISOString() : '',
        completed_by_name: completed ? actor.customUser.full_name : '',
      };

      let saved;
      if (p.id) {
        saved = await db.asServiceRole.entities.WeeklyFeedbackAssignment.update(p.id, data);
      } else {
        saved = await db.asServiceRole.entities.WeeklyFeedbackAssignment.create({
          ...data,
          created_by_name: actor.customUser.full_name,
        });
        await db.asServiceRole.entities.Notification.create({
          recipient_id: tutor.id,
          type: 'weekly_feedback',
          title: 'New class feedback assigned',
          message: `${className} was assigned for the week of ${p.week_start_date}.`,
          reference_id: saved.id,
          is_read: false,
        });
      }
      return Response.json({ record: saved });
    }

    if (action === 'complete') {
      const assignment = await db.asServiceRole.entities.WeeklyFeedbackAssignment.get(body.id)
        .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
      if (!assignment) return Response.json({ error: 'Assignment not found' }, { status: 404 });
      const isOwner = assignment.tutor_id === actor.customUser.id;
      if (!isOwner && !canManageWeeklyFeedback(actor)) {
        return Response.json({ error: 'Not allowed' }, { status: 403 });
      }
      const completed = body.status === 'completed';
      const updated = await db.asServiceRole.entities.WeeklyFeedbackAssignment.update(assignment.id, {
        status: completed ? 'completed' : 'pending',
        completed_at: completed ? new Date().toISOString() : '',
        completed_by_name: completed ? actor.customUser.full_name : '',
        notes: body.notes !== undefined ? body.notes : assignment.notes || '',
      });
      return Response.json({ record: updated });
    }

    if (action === 'delete') {
      if (!canManageWeeklyFeedback(actor)) return Response.json({ error: 'Not allowed' }, { status: 403 });
      if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 });
      await db.asServiceRole.entities.WeeklyFeedbackAssignment.delete(body.id);
      return Response.json({ deleted: true });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}