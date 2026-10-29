const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

export const HEAD_ROLES = ['Head of Retention', 'Head of Tutor'];
export const FEEDBACK_ROLES = ['Head of Retention', 'Head of Tutor', 'QC Team', 'Team Leader'];
export const TASK_VIEW_ROLES = ['Head of Retention', 'Head of Tutor', 'Team Leader'];
export const QC_REVIEW_ROLES = ['Head of Retention', 'Head of Tutor', 'QC Team', 'Team Leader'];
export const TUTOR_ROLES = ['Tutor', 'Team Leader'];

// Resolves the signed-in person to the app's CustomUser record (role + RBAC live there).
//
// This app signs users in with its own CustomUser accounts, so most requests carry no
// Base44 platform session. Two paths are therefore supported, and both are validated
// server-side: the platform session (matched by email) and the app session issued at
// login (CustomUser id + its stored random session token).
export async function resolveActor(base44, body = {}) {
  let platformUser = null;
  try {
    platformUser = await db.auth.me();
  } catch {
    platformUser = null;
  }

  let customUser = null;
  if (platformUser?.email) {
    const page = await db.asServiceRole.entities.CustomUser.filter({ email: platformUser.email }, { limit: 1 });
    customUser = (page?.items || [])[0] || null;
  }

  if (!customUser && body?.actor_id && body?.actor_token) {
    const record = await db.asServiceRole.entities.CustomUser
      .get(body.actor_id)
      .catch((e) => (e?.status === 404 ? null : Promise.reject(e)));
    if (record && record.is_active !== false && record.session_token && String(record.session_token) === String(body.actor_token)) {
      customUser = record;
    }
  }

  return { platformUser, customUser, role: customUser?.role || null, rbac: customUser?.rbac || null };
}

export function isActiveActor(actor) {
  return !!actor?.customUser && actor.customUser.is_active !== false;
}

function allowedByRole(actor, roles) {
  if (!isActiveActor(actor)) return false;
  return roles.includes(actor.role);
}

function enabled(actor, key) {
  // A missing rbac object means "no restriction configured" for this app's managerial roles.
  if (!actor?.rbac) return true;
  return actor.rbac[key] !== false;
}

export function isTutor(actor) {
  return allowedByRole(actor, ['Tutor']);
}

export function canReviewWeeklyFeedback(actor) {
  return allowedByRole(actor, FEEDBACK_ROLES) && enabled(actor, 'weekly_feedback');
}

export function canViewWeeklyFeedback(actor) {
  return canReviewWeeklyFeedback(actor) || isTutor(actor);
}

export function canManageWeeklyFeedback(actor) {
  return canReviewWeeklyFeedback(actor);
}

export function canManageTasks(actor) {
  return allowedByRole(actor, ['Team Leader']) && enabled(actor, 'task_management');
}

export function canViewTaskManagement(actor) {
  if (!isActiveActor(actor)) return false;
  return TASK_VIEW_ROLES.includes(actor.role) && enabled(actor, 'task_management');
}

// QC submissions: reviewers monitor everything, tutors only their own.
export function canReviewQCSubmissions(actor) {
  return allowedByRole(actor, QC_REVIEW_ROLES);
}

export function canSubmitQC(actor) {
  return allowedByRole(actor, TUTOR_ROLES);
}

export function canExportModule(actor, module) {
  if (!isActiveActor(actor)) return false;
  if (module === 'tutor_tasks') return allowedByRole(actor, TASK_VIEW_ROLES) && enabled(actor, 'task_management');
  if (module === 'qc_submissions' || module === 'qc_records') return allowedByRole(actor, QC_REVIEW_ROLES);
  return allowedByRole(actor, FEEDBACK_ROLES);
}