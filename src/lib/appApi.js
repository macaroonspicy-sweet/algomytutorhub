const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };


// The app signs users in with its own CustomUser records, so backend functions cannot rely on
// the Base44 platform session. Every call carries the signed-in app user and the random session
// token issued to that account at login; the backend validates both before using the role.
export function sessionActor() {
  try {
    const user = JSON.parse(localStorage.getItem('tutorhu_user') || 'null');
    if (!user?.id) return {};
    return { actor_id: user.id, actor_token: user.session_token || '' };
  } catch {
    return {};
  }
}

export function invokeService(functionName, payload = {}) {
  return db.functions.invoke(functionName, { ...sessionActor(), ...payload });
}