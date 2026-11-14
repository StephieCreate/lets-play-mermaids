import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
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

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
