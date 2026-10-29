import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AppAuthContext = createContext(null);

async function ensureSessionToken(user) {
  if (!user) return user;
  if (user.session_token) return user;
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  try {
    await supabase.from('CustomUser').update({ session_token: token }).eq('id', user.id);
    return { ...user, session_token: token };
  } catch {
    return user;
  }
}

function applyEffectiveRbac(user) {
  if (!user) return user;
  let rbac = user.rbac && typeof user.rbac === 'object' ? { ...user.rbac } : {};

  if (rbac.qc_tutor === true) {
    rbac.qc_records = true;
    rbac.qc_monthly = true;
  }

  if (user.role === 'Tutor' || user.role === 'Team Leader') {
    rbac.my_qc = true;
  }

  if (['Head of Retention', 'Head of Tutor', 'QC Team', 'Team Leader'].includes(user.role) && rbac.weekly_feedback === undefined) {
    rbac.weekly_feedback = true;
  }
  if (['Head of Retention', 'Head of Tutor', 'Team Leader'].includes(user.role) && rbac.task_management === undefined) {
    rbac.task_management = true;
  }
  if (['Head of Retention', 'Head of Tutor', 'QC Team', 'Team Leader'].includes(user.role) && rbac.qc_submissions === undefined) {
    rbac.qc_submissions = true;
  }
  if (user.role === 'Tutor') {
    if (rbac.my_tasks === undefined) rbac.my_tasks = true;
    if (rbac.my_weekly_feedback === undefined) rbac.my_weekly_feedback = true;
  }

  return { ...user, rbac };
}

export function AppAuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoadingAppAuth, setIsLoadingAppAuth] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('tutorhu_user');
    if (!stored) { setIsLoadingAppAuth(false); return; }
    try {
      const cached = JSON.parse(stored);
      setCurrentUser(applyEffectiveRbac(cached));

      supabase.from('CustomUser')
        .select('*')
        .eq('email', cached.email)
        .maybeSingle()
        .then(async ({ data: user }) => {
          if (user) {
            const withSession = await ensureSessionToken(user);
            const fresh = applyEffectiveRbac(withSession);
            setCurrentUser(fresh);
            localStorage.setItem('tutorhu_user', JSON.stringify(fresh));
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingAppAuth(false));
    } catch {
      setIsLoadingAppAuth(false);
    }
  }, []);

  const hashPassword = async (password) => {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const login = async (identifier, password) => {
    const identifierClean = identifier.trim().toLowerCase();

    const { data: users, error } = await supabase
      .from('CustomUser')
      .select('*')
      .or(`email.ilike.${identifierClean},username.ilike.${identifierClean}`);

    if (error) {
      console.error('[Supabase Auth Error]:', error.message);
      throw new Error('Gagal terhubung ke server database');
    }

    const user = (users && users[0]) || null;
    if (!user) throw new Error('User not found');
    if (user.is_active === false) throw new Error('Account is inactive');

    const hashedPassword = await hashPassword(password);
    const storedHash = user.password_hash || '';

    if (storedHash.startsWith('sha256:')) {
      if (storedHash !== `sha256:${hashedPassword}`) throw new Error('Invalid password');
    } else if (storedHash.length === 64 && /^[0-9a-f]+$/.test(storedHash)) {
      if (storedHash !== hashedPassword) throw new Error('Invalid password');
      await supabase.from('CustomUser').update({ password_hash: `sha256:${hashedPassword}` }).eq('id', user.id);
    } else {
      if (storedHash !== password) {
        const legacyHash = await hashPassword(storedHash);
        if (legacyHash !== hashedPassword) throw new Error('Invalid password');
      }
      await supabase.from('CustomUser').update({ password_hash: `sha256:${hashedPassword}` }).eq('id', user.id);
    }

    const sessionToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
    await supabase.from('CustomUser').update({ session_token: sessionToken }).eq('id', user.id);

    const effectiveUser = applyEffectiveRbac({ ...user, session_token: sessionToken });
    setCurrentUser(effectiveUser);
    localStorage.setItem('tutorhu_user', JSON.stringify(effectiveUser));
    return effectiveUser;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('tutorhu_user');
  };

  const refreshUser = async () => {
    const stored = localStorage.getItem('tutorhu_user');
    if (!stored) return;
    const parsed = JSON.parse(stored);

    const { data: user } = await supabase
      .from('CustomUser')
      .select('*')
      .eq('email', parsed.email)
      .maybeSingle();

    if (user) {
      const fresh = applyEffectiveRbac(await ensureSessionToken(user));
      setCurrentUser(fresh);
      localStorage.setItem('tutorhu_user', JSON.stringify(fresh));
    }
  };

  const hasPermission = (key) => {
    if (!currentUser) return false;
    if (!currentUser.rbac) return true;
    if ((key === 'qc_records' || key === 'qc_monthly') && currentUser.rbac['qc_tutor'] === true) return true;
    return currentUser.rbac[key] === true;
  };

  return (
    <AppAuthContext.Provider value={{ currentUser, isLoadingAppAuth, login, logout, refreshUser, hasPermission }}>
      {children}
    </AppAuthContext.Provider>
  );
}

export function useAppAuth() {
  return useContext(AppAuthContext);
}

export default AppAuthContext;