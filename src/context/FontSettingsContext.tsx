import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_READING_PREFERENCES,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  toReadingPreferences,
  type FontFamilyKey,
  type FontSizeKey,
  type LineHeightKey,
  type ReadingPreferences,
} from '@/data/readingPreferences';

const STORAGE_KEY = 'mermaids-font-settings';
const JELLYFISH_CURSOR_KEY = 'mermaids_jellyfish_cursor';
const COLLAPSE_SCENE_NOTES_KEY = 'mermaids_collapse_scene_notes';
const LOAD_ERROR = 'Your saved reading preferences could not be loaded.';
const SAVE_ERROR = 'Your reading preferences could not be saved to your account.';

interface FontSettingsContextValue {
  family: FontFamilyKey;
  size: FontSizeKey;
  lineHeight: LineHeightKey;
  fontFamilyClass: string;
  fontPx: string;
  syncError: string | null;
  jellyfishCursor: boolean;
  collapseSceneNotes: boolean;
  setFamily: (family: FontFamilyKey) => void;
  setSize: (size: FontSizeKey) => void;
  setLineHeight: (lineHeight: LineHeightKey) => void;
  setJellyfishCursor: (enabled: boolean) => void;
  setCollapseSceneNotes: (enabled: boolean) => void;
}

const FontSettingsContext = createContext<FontSettingsContextValue | undefined>(undefined);

function loadLocalPreferences(): ReadingPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? toReadingPreferences(JSON.parse(raw) ?? {}) : DEFAULT_READING_PREFERENCES;
  } catch {
    return DEFAULT_READING_PREFERENCES;
  }
}

function loadLocalFlag(key: string, fallback = false): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

async function savePreferencesToAccount(userId: string, prefs: ReadingPreferences): Promise<string | null> {
  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: userId,
      font_family: prefs.family,
      font_size: prefs.size,
      line_height: prefs.lineHeight,
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('Failed to save reading preferences', error);
    return SAVE_ERROR;
  }
  return null;
}

export function FontSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [prefs, setPrefs] = useState<ReadingPreferences>(loadLocalPreferences);
  const [jellyfishCursor, setJellyfishCursorState] = useState<boolean>(() =>
    loadLocalFlag(JELLYFISH_CURSOR_KEY, false),
  );
  const [collapseSceneNotes, setCollapseSceneNotesState] = useState<boolean>(() =>
    loadLocalFlag(COLLAPSE_SCENE_NOTES_KEY, false),
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const prefsRef = useRef(prefs);

  const applyPreferences = useCallback((next: ReadingPreferences) => {
    prefsRef.current = next;
    setPrefs(next);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore write errors
    }
    const lineHeightValue = LINE_HEIGHT_OPTIONS.find((o) => o.key === prefs.lineHeight)?.value ?? '1.75';
    document.documentElement.style.setProperty('--reading-line-height', lineHeightValue);
  }, [prefs]);

  useEffect(() => {
    try {
      localStorage.setItem(JELLYFISH_CURSOR_KEY, String(jellyfishCursor));
    } catch {
      // ignore write errors
    }
    document.documentElement.classList.toggle('jellyfish-cursor-active', jellyfishCursor);
  }, [jellyfishCursor]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_SCENE_NOTES_KEY, String(collapseSceneNotes));
    } catch {
      // ignore write errors
    }
  }, [collapseSceneNotes]);

  useEffect(() => {
    if (!userId) {
      setSyncError(null);
      return;
    }
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('font_family, font_size, line_height')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error('Failed to load reading preferences', error);
        setSyncError(LOAD_ERROR);
        return;
      }
      if (data) {
        applyPreferences(
          toReadingPreferences({
            family: data.font_family,
            size: data.font_size,
            lineHeight: data.line_height,
          }),
        );
        setSyncError(null);
        return;
      }
      const saveResult = await savePreferencesToAccount(userId, prefsRef.current);
      if (!cancelled) setSyncError(saveResult);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, applyPreferences]);

  const updatePreferences = useCallback(
    (patch: Partial<ReadingPreferences>) => {
      const next = { ...prefsRef.current, ...patch };
      applyPreferences(next);
      if (userId) {
        savePreferencesToAccount(userId, next).then(setSyncError);
      }
    },
    [userId, applyPreferences],
  );

  const setFamily = useCallback((family: FontFamilyKey) => updatePreferences({ family }), [updatePreferences]);
  const setSize = useCallback((size: FontSizeKey) => updatePreferences({ size }), [updatePreferences]);
  const setLineHeight = useCallback(
    (lineHeight: LineHeightKey) => updatePreferences({ lineHeight }),
    [updatePreferences],
  );
  const setJellyfishCursor = useCallback((enabled: boolean) => setJellyfishCursorState(enabled), []);
  const setCollapseSceneNotes = useCallback((enabled: boolean) => setCollapseSceneNotesState(enabled), []);

  const value = useMemo<FontSettingsContextValue>(() => {
    const fontOption = FONT_OPTIONS.find((o) => o.key === prefs.family) ?? FONT_OPTIONS[1];
    const sizeOption = FONT_SIZE_OPTIONS.find((o) => o.key === prefs.size) ?? FONT_SIZE_OPTIONS[1];
    return {
      family: prefs.family,
      size: prefs.size,
      lineHeight: prefs.lineHeight,
      fontFamilyClass: fontOption.className,
      fontPx: sizeOption.px,
      syncError,
      jellyfishCursor,
      collapseSceneNotes,
      setFamily,
      setSize,
      setLineHeight,
      setJellyfishCursor,
      setCollapseSceneNotes,
    };
  }, [
    prefs,
    syncError,
    jellyfishCursor,
    collapseSceneNotes,
    setFamily,
    setSize,
    setLineHeight,
    setJellyfishCursor,
    setCollapseSceneNotes,
  ]);

  return <FontSettingsContext.Provider value={value}>{children}</FontSettingsContext.Provider>;
}

export function useFontSettings() {
  const ctx = useContext(FontSettingsContext);
  if (!ctx) throw new Error('useFontSettings must be used within FontSettingsProvider');
  return ctx;
}