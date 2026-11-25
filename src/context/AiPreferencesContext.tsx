import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export interface ActiveAiPreference {
  provider: string;
  model: string | null;
}

interface AiPreferencesContextValue {
  /** Provider + model for the currently active key, hydrated from Supabase (source of truth). */
  activePreference: ActiveAiPreference | null;
  /** True until the first Supabase fetch for the signed-in user resolves. */
  hydrated: boolean;
  /** Persist a provider + model choice for the signed-in user (also refreshes the local cache). */
  savePreference: (userId: string, provider: string, model: string | null) => Promise<void>;
}

const AiPreferencesContext = createContext<AiPreferencesContextValue | null>(null);

const CACHE_KEY = 'mermaids_ai_pref_cache';

function readCache(): ActiveAiPreference | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveAiPreference>;
    if (typeof parsed.provider !== 'string' || !parsed.provider) return null;
    return { provider: parsed.provider, model: typeof parsed.model === 'string' ? parsed.model : null };
  } catch {
    return null;
  }
}

function writeCache(pref: ActiveAiPreference) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(pref));
  } catch {
    // ignore write errors
  }
}

export function AiPreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [activePreference, setActivePreference] = useState<ActiveAiPreference | null>(readCache);
  const [hydrated, setHydrated] = useState(false);
  const prefRef = useRef(activePreference);

  const setPreference = useCallback((next: ActiveAiPreference) => {
    prefRef.current = next;
    setActivePreference(next);
    writeCache(next);
  }, []);

  useEffect(() => {
    if (!userId) {
      setHydrated(false);
      return;
    }
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('ai_provider, ai_model')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error('Failed to load AI preferences', error);
        setHydrated(true);
        return;
      }
      if (data && data.ai_provider) {
        setPreference({ provider: data.ai_provider, model: data.ai_model ?? null });
      }
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, setPreference]);

  const savePreference = useCallback(
    async (prefUserId: string, provider: string, model: string | null) => {
      const next = { provider, model };
      setPreference(next);
      const { error } = await supabase.from('user_settings').upsert(
        {
          user_id: prefUserId,
          ai_provider: provider,
          ai_model: model,
        },
        { onConflict: 'user_id' },
      );
      if (error) {
        console.error('Failed to save AI preferences', error);
      }
    },
    [setPreference],
  );

  const value = useMemo<AiPreferencesContextValue>(
    () => ({ activePreference, hydrated, savePreference }),
    [activePreference, hydrated, savePreference],
  );

  return <AiPreferencesContext.Provider value={value}>{children}</AiPreferencesContext.Provider>;
}

export function useAiPreferences(): AiPreferencesContextValue {
  const ctx = useContext(AiPreferencesContext);
  if (!ctx) throw new Error('useAiPreferences must be used within AiPreferencesProvider');
  return ctx;
}
