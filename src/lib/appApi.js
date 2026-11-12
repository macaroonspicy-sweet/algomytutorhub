import { supabase } from '@/lib/supabaseClient';

const db = globalThis.__B44_DB__ || {
  auth: { isAuthenticated: async () => false, me: async () => null },
  entities: new Proxy(
    {},
    {
      get: () => ({
        filter: async () => [],
        get: async () => null,
        create: async () => ({}),
        update: async () => ({}),
        delete: async () => ({}),
      }),
    }
  ),
  integrations: { Core: { UploadFile: async () => ({ file_url: '' }) } },
};

export function getCurrentAppUser() {
  try {
    return JSON.parse(localStorage.getItem('tutorhu_user') || 'null');
  } catch {
    return null;
  }
}

export function sessionActor() {
  const user = getCurrentAppUser();
  if (!user?.id) return {};
  return { actor_id: user.id, actor_token: user.session_token || '' };
}

const makeId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

async function logTaskActivity({
  task_id,
  action,
  actor,
  from_status = null,
  to_status = null,
  note = null,
}) {
  const now = new Date().toISOString();
  await supabase.from('TaskActivity').insert({
    id: makeId(),
    task_id,
    action,
    actor_id: actor?.id || null,
    actor_name: actor?.full_name || 'System',
    actor_role: actor?.role || null,
    from_status,
    to_status,
    note,
    created_date: now,
    updated_date: now,
    created_by_id: actor?.id || null,
    is_sample: false,
  });
}

async function handleTaskService(payload) {
  const actor = getCurrentAppUser();
  const now = new Date().toISOString();

  // 1. LIST TASKS
  if (payload.action === 'list') {
    const { data, error } = await supabase
      .from('TutorTask')
      .select('*')
      .order('created_date', { ascending: false });

    if (error) return { data: { error: error.message } };
    return { data: { items: data || [] } };
  }

  // 2. HISTORY
  if (payload.action === 'history') {
    const { data, error } = await supabase
      .from('TaskActivity')
      .select('*')
      .eq('task_id', payload.task_id)
      .order('created_date', { ascending: false });

    if (error) return { data: { error: error.message } };
    return { data: { items: data || [] } };
  }

  // 3. CREATE TASK
  if (payload.action === 'create') {
    const tutorIds = payload.tutor_ids || [];
    if (!tutorIds.length) {
      return { data: { error: 'Minimal pilih 1 tutor' } };
    }

    const { data: users, error: userErr } = await supabase
      .from('CustomUser')
      .select('id, full_name')
      .in('id', tutorIds);

    if (userErr) return { data: { error: userErr.message } };

    const userMap = Object.fromEntries((users || []).map((u) => [u.id, u.full_name]));
    const groupId = makeId();

    const rowsToInsert = tutorIds.map((tid) => ({
      id: makeId(),
      group_id: groupId,
      title: payload.title?.trim(),
      description: payload.description || '',
      category: payload.category || 'Student Feedback',
      priority: payload.priority || 'Medium',
      start_date: payload.start_date || now.slice(0, 10),
      deadline: payload.deadline || null,
      status: 'pending',
      assigned_tutor_id: tid,
      assigned_tutor_name: userMap[tid] || 'Unknown Tutor',
      assigned_by_id: actor?.id || null,
      assigned_by_name: actor?.full_name || 'Team Leader',
      progress_notes: '',
      completion_notes: '',
      revision_note: '',
      revision_requested: false,
      completed_at: null,
      linked_week_start_date: payload.linked_week_start_date || null,
      linked_week_end_date: payload.linked_week_end_date || null,
      linked_class_name: payload.linked_class_name || null,
      created_date: now,
      updated_date: now,
      created_by_id: actor?.id || null,
      is_sample: false,
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from('TutorTask')
      .insert(rowsToInsert)
      .select();

    if (insertErr) return { data: { error: insertErr.message } };

    for (const task of inserted || []) {
      await logTaskActivity({
        task_id: task.id,
        action: 'assigned',
        actor,
        to_status: 'pending',
        note: `Assigned to ${task.assigned_tutor_name}`,
      });
    }

    return { data: { created: (inserted || []).length, items: inserted || [] } };
  }

  // 4. UPDATE BY TEAM LEADER / MANAGER
  if (payload.action === 'update') {
    const { data: existing, error: fetchErr } = await supabase
      .from('TutorTask')
      .select('*')
      .eq('id', payload.task_id)
      .single();

    if (fetchErr || !existing) {
      return { data: { error: fetchErr?.message || 'Task tidak ditemukan' } };
    }

    const updates = { ...(payload.fields || {}), updated_date: now };

    if (updates.status === 'completed' && existing.status !== 'completed') {
      updates.completed_at = now;
      updates.revision_requested = false;
    }

    if (payload.revision_note) {
      updates.status = 'in_progress';
      updates.revision_requested = true;
      updates.revision_note = payload.revision_note;
    }

    if (payload.tutor_id && payload.tutor_id !== existing.assigned_tutor_id) {
      const { data: newTutor } = await supabase
        .from('CustomUser')
        .select('id, full_name')
        .eq('id', payload.tutor_id)
        .single();

      updates.assigned_tutor_id = payload.tutor_id;
      updates.assigned_tutor_name = newTutor?.full_name || 'Unknown Tutor';
    }

    const { data: updated, error: updErr } = await supabase
      .from('TutorTask')
      .update(updates)
      .eq('id', payload.task_id)
      .select()
      .single();

    if (updErr) return { data: { error: updErr.message } };

    if (payload.revision_note) {
      await logTaskActivity({
        task_id: existing.id,
        action: 'revision_requested',
        actor,
        from_status: existing.status,
        to_status: 'in_progress',
        note: payload.revision_note,
      });
    } else if (payload.comment) {
      await logTaskActivity({
        task_id: existing.id,
        action: 'comment',
        actor,
        note: payload.comment,
      });
    } else {
      if (updates.status && updates.status !== existing.status) {
        await logTaskActivity({
          task_id: existing.id,
          action: 'status_changed',
          actor,
          from_status: existing.status,
          to_status: updates.status,
        });
      }
      if (updates.deadline && updates.deadline !== existing.deadline) {
        await logTaskActivity({
          task_id: existing.id,
          action: 'deadline_changed',
          actor,
          note: `New deadline: ${updates.deadline}`,
        });
      }
      if (updates.assigned_tutor_id && updates.assigned_tutor_id !== existing.assigned_tutor_id) {
        await logTaskActivity({
          task_id: existing.id,
          action: 'reassigned',
          actor,
          note: `Reassigned to ${updates.assigned_tutor_name}`,
        });
      }
    }

    return { data: { task: updated } };
  }

  // 5. UPDATE BY TUTOR (My Assigned Tasks)
  if (payload.action === 'updateMine') {
    const { data: existing, error: fetchErr } = await supabase
      .from('TutorTask')
      .select('*')
      .eq('id', payload.task_id)
      .single();

    if (fetchErr || !existing) {
      return { data: { error: fetchErr?.message || 'Task tidak ditemukan' } };
    }

    const updates = {
      status: payload.status || existing.status,
      progress_notes: payload.progress_notes ?? existing.progress_notes,
      completion_notes: payload.completion_notes ?? existing.completion_notes,
      updated_date: now,
    };

    if (updates.status === 'completed' && existing.status !== 'completed') {
      updates.completed_at = now;
      updates.revision_requested = false;
    }

    const { data: updated, error: updErr } = await supabase
      .from('TutorTask')
      .update(updates)
      .eq('id', payload.task_id)
      .select()
      .single();

    if (updErr) return { data: { error: updErr.message } };

    if (updates.status !== existing.status) {
      await logTaskActivity({
        task_id: existing.id,
        action: 'status_changed',
        actor,
        from_status: existing.status,
        to_status: updates.status,
        note: payload.completion_notes || payload.progress_notes || null,
      });
    } else if (payload.progress_notes || payload.completion_notes) {
      await logTaskActivity({
        task_id: existing.id,
        action: 'comment',
        actor,
        note: payload.completion_notes || payload.progress_notes,
      });
    }

    return { data: { task: updated } };
  }

  return { data: { error: `Unknown taskService action: ${payload.action}` } };
}

export async function invokeService(functionName, payload = {}) {
  if (functionName === 'taskService') {
    return handleTaskService(payload);
  }
  return db.functions.invoke(functionName, { ...sessionActor(), ...payload });
}