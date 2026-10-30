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

  const login = async (identifier, password) => {
    // Memanggil Vercel Serverless API Proxy
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Login failed');
    }

    const effectiveUser = applyEffectiveRbac(result);
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