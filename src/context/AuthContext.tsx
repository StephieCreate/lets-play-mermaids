import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const PASSWORD_ROTATION_DAYS = 90;

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  passwordAgeDays: number;
  daysUntilPasswordReset: number;
  isPasswordExpired: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function computePasswordAgeDays(user: User | null): number {
  if (!user) return 0;
  const updatedAt = user.user_metadata?.password_updated_at as string | undefined;
  const reference = updatedAt ?? user.created_at;
  if (!reference) return 0;
  const ageMs = Date.now() - new Date(reference).getTime();
  return Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const user = session?.user ?? null;
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setIsPasswordRecovery(false);
      }
    });
    // Proactively refresh the session when the tab becomes visible again,
    // since browser background throttling can pause the auto-refresh timer.
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.auth.refreshSession().then(({ data, error }) => {
        if (!error && data.session) {
          setSession(data.session);
        } else {
          supabase.auth.getSession().then(({ data: sd }) => setSession(sd.session));
        }
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Periodic safety-net refresh every 10 minutes while the tab is open.
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      supabase.auth.refreshSession().then(({ data, error }) => {
        if (!error && data.session) {
          setSession(data.session);
        } else {
          supabase.auth.getSession().then(({ data: sd }) => setSession(sd.session));
        }
      });
    }, 10 * 60 * 1000);

    return () => {
      listener.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(refreshInterval);
    };
  }, []);

  // Re-check admin status whenever the authenticated session changes
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (cancelled) return;
      setIsAdmin(!error && data === true);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { password_updated_at: new Date().toISOString() } },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    return { error: error?.message ?? null };
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { password_updated_at: new Date().toISOString() },
    });
    return { error: error?.message ?? null };
  }, []);

  const clearPasswordRecovery = useCallback(() => setIsPasswordRecovery(false), []);

  
  const passwordAgeDays = computePasswordAgeDays(user);
  const daysUntilPasswordReset = Math.max(0, PASSWORD_ROTATION_DAYS - passwordAgeDays);
  const isPasswordExpired = passwordAgeDays >= PASSWORD_ROTATION_DAYS;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        isAdmin,
        isPasswordRecovery,
        clearPasswordRecovery,
        passwordAgeDays,
        daysUntilPasswordReset,
        isPasswordExpired,
        signIn,
        signUp,
        signOut,
        resetPasswordForEmail,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
