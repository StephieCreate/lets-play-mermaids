import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Send, Waves, BookOpen, ScrollText, Home, Sparkles, Box, Loader2, Trash2, AlertTriangle, X, Dices, Sun, Copy, Check, Bug, Minus, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Character, Playthrough } from '@/types/database';
import { resolveApexName } from '@/lib/customApexes';
import NotesPanel from '@/components/NotesPanel';
import DailySaveLog from '@/components/DailySaveLog';
import NarrativeSummaries from '@/components/NarrativeSummaries';
import ExtrasPanel from '@/components/ExtrasPanel';
import { useFontSettings } from '@/context/FontSettingsContext';
import MarkdownNarrative from '@/components/MarkdownNarrative';
import GrottoRegistry from '@/components/GrottoRegistry';

interface PlayScreenProps {
  playthroughId: string;
  onBack: () => void;
  onSignIn: () => void;
  onReportBug: () => void;
}

type TabId = 'play' | 'daily-save-log' | 'narrative-summaries' | 'grotto-registry' | 'plot-wishlist' | 'extras';
type StatPillId = 'stamina' | 'hp' | 'level' | 'bond';

const tabs: { id: TabId; label: string; icon: typeof Waves }[] = [
  { id: 'play', label: 'Play', icon: Waves },
  { id: 'daily-save-log', label: 'Daily Save Log', icon: BookOpen },
  { id: 'narrative-summaries', label: 'Narrative Summaries', icon: ScrollText },
  { id: 'grotto-registry', label: 'Grotto Registry', icon: Home },
  { id: 'plot-wishlist', label: 'Plot Wish List', icon: Sparkles },
  { id: 'extras', label: 'Extras', icon: Box },
];

const noteTabs: { id: Exclude<TabId, 'play'>; title: string; label: string; description: string }[] = [
  { id: 'daily-save-log', title: 'Daily Save Log', label: 'Playthrough record', description: 'A running log of your daily saves and session checkpoints.' },
  { id: 'narrative-summaries', title: 'Narrative Summaries', label: 'Story recaps', description: 'Summaries of key story beats and plot developments so far.' },
  { id: 'grotto-registry', title: 'Player Grotto Registry', label: 'World tracker', description: 'Locations, NPCs, items, and discoveries you have encountered.' },
  { id: 'plot-wishlist', title: 'Narrative Plot Wish List', label: 'Story goals', description: 'Plot threads and moments you hope to see unfold in your story.' },
  { id: 'extras', title: 'Extras', label: 'Additional material', description: 'Any extra notes, reference material, or custom content for your game.' },
];

interface ChatMessage {
  id: string | null;
  role: 'narrator' | 'player';
  content: string;
  seq: number;
}

interface ParsedStats {
  stamina?: number;
  max_stamina?: number;
  hp?: number;
  max_hp?: number;
  level?: number;
  xp?: number;
  bond_level?: number;
  bond_xp?: number;
}

const nextSeqFor = (messages: ChatMessage[]) =>
  messages.reduce((max, m) => Math.max(max, m.seq), -1) + 1;

/**
 * Extracts Stamina, Health, Level, XP, Bond Level, and Bond XP from the markdown Daily Save Log.
 */
function parseStatsFromSaveLog(logText: string): ParsedStats {
  const parsed: ParsedStats = {};
  if (!logText) return parsed;

  const stamMatch = logText.match(/\*\*Stamina:\*\*\s*(\d+)\s*\/\s*(\d+)/i);
  if (stamMatch) {
    parsed.stamina = parseInt(stamMatch[1], 10);
    parsed.max_stamina = parseInt(stamMatch[2], 10);
  }

  const hpMatch = logText.match(/\*\*Health:\*\*\s*(\d+)\s*\/\s*(\d+)/i);
  if (hpMatch) {
    parsed.hp = parseInt(hpMatch[1], 10);
    parsed.max_hp = parseInt(hpMatch[2], 10);
  }

  const lvlMatch = logText.match(/\*\*Global Level:\*\*\s*(\d+)/i);
  if (lvlMatch) {
    parsed.level = parseInt(lvlMatch[1], 10);
  }

  const xpMatch = logText.match(/\*\*Current XP:\*\*\s*(\d+)\s*\/\s*(\d+)\s*to\s*next/i);
  if (xpMatch) {
    parsed.xp = parseInt(xpMatch[1], 10);
  }

  const bondLvlMatch = logText.match(/\*\*Bond Level:\*\*\s*(\d+)/i);
  if (bondLvlMatch) {
    parsed.bond_level = parseInt(bondLvlMatch[1], 10);
  }

  const bondXpMatch = logText.match(/\*\*Bond XP:\*\*\s*(\d+)\s*\/\s*(\d+)/i);
  if (bondXpMatch) {
    parsed.bond_xp = parseInt(bondXpMatch[1], 10);
  }

  return parsed;
}

/**
 * Scans narrator chat messages in chronological order so any Bond Update, Stat Tracker,
 * Stamina, HP, Level, or XP changes that happened AFTER the last save log are reflected in the UI.
 */
function parseStatsFromChatMessages(messages: ChatMessage[], current: ParsedStats): ParsedStats {
  const result: ParsedStats = { ...current };

  for (const m of messages) {
    if (m.role !== 'narrator') continue;
    // Strip Markdown bold/italic/code symbols (*, _, ~, `) so styling never blocks regex matching
    const text = m.content.replace(/[*_~`]/g, '');

    // 1. Structured Stat Tracker line (if present)
    const trackerLine = text.match(/Stat Tracker:\s*([^\n]+)/i)?.[1];
    if (trackerLine) {
      const stm = trackerLine.match(/Stm\s*\[?\s*(\d+)\s*\/\s*(\d+)\s*\]?/i);
      if (stm) {
        result.stamina = parseInt(stm[1], 10);
        result.max_stamina = parseInt(stm[2], 10);
      }
      const hp = trackerLine.match(/HP\s*\[?\s*(\d+)\s*\/\s*(\d+)\s*\]?/i);
      if (hp) {
        result.hp = parseInt(hp[1], 10);
        result.max_hp = parseInt(hp[2], 10);
      }
      const lvl = trackerLine.match(/Lvl\s*\[?\s*(\d+)\s*\]?\s*\(\s*XP\s*\[?\s*(\d+)\s*\/\s*(\d+)/i);
      if (lvl) {
        result.level = parseInt(lvl[1], 10);
        result.xp = parseInt(lvl[2], 10);
      }
      const bond = trackerLine.match(/Bond\s*\[?\s*(\d+)\s*\]?\s*\(\s*(?:Bond\s*)?XP\s*\[?\s*(\d+)\s*\/\s*(\d+)/i);
      if (bond) {
        result.bond_level = parseInt(bond[1], 10);
        result.bond_xp = parseInt(bond[2], 10);
      }
    }

    // 2. Stamina (catches all matches in the message in order)
    for (const natStm of text.matchAll(/\b(?:Stamina|Stm)\b[^.\n/]{0,40}?(\d+)\s*\/\s*(\d+)/gi)) {
      result.stamina = parseInt(natStm[1], 10);
      result.max_stamina = parseInt(natStm[2], 10);
    }

    // 3. Health / HP
    for (const natHp of text.matchAll(/\b(?:Health|HP)\b[^.\n/]{0,40}?(\d+)\s*\/\s*(\d+)/gi)) {
      result.hp = parseInt(natHp[1], 10);
      result.max_hp = parseInt(natHp[2], 10);
    }

    // 4. Global Level & XP
    for (const natLvl of text.matchAll(/\b(?:Global\s+Level|Character\s+Level)\b[^.\n]{0,20}?(\d+)/gi)) {
      result.level = parseInt(natLvl[1], 10);
    }
    for (const natXp of text.matchAll(/\b(?:Current\s+XP|Character\s+XP|Global\s+XP)\b[^.\n/]{0,30}?(\d+)\s*\/\s*(\d+)/gi)) {
      result.xp = parseInt(natXp[1], 10);
    }

    // 5. Bond Level & Bond XP (immune to bolding and long explanations)
    const bondMatches = Array.from(
      text.matchAll(/(?:Current\s+Bond|Bond\s*(?:Level|Tier))\s*:?\s*(?:Level\s*|Tier\s*)?(\d+)\b[^\n\d]{1,30}?(\d+)\s*\/\s*(\d+)/gi)
    );
    if (bondMatches.length > 0) {
      const last = bondMatches[bondMatches.length - 1];
      result.bond_level = parseInt(last[1], 10);
      result.bond_xp = parseInt(last[2], 10);
    } else {
      const bondLvlOnly = text.match(/\b(?:Current\s+Bond|Bond\s*(?:Level|Tier))\b[^.\n]{0,25}?(?:Level\s*|Tier\s*)?(\d+)/i);
      if (bondLvlOnly) {
        result.bond_level = parseInt(bondLvlOnly[1], 10);
      }
      const bondXpOnly = text.match(/\bBond\s*XP\b[^\n]*?(\d+)\s*\/\s*(\d+)/i);
      if (bondXpOnly) {
        result.bond_xp = parseInt(bondXpOnly[1], 10);
      }
    }
  }

  return result;
}

export default function PlayScreen({ playthroughId, onBack, onSignIn, onReportBug }: PlayScreenProps) {
  const { user } = useAuth();
  const { fontFamilyClass, fontPx } = useFontSettings();
  const [character, setCharacter] = useState<Character | null>(null);
  const [playthrough, setPlaythrough] = useState<Playthrough | null>(null);
  const [apexName, setApexName] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('play');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [gentleDay, setGentleDay] = useState(false);
  const gentleDayRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Stat Tracker UI State
  const [openStatPill, setOpenStatPill] = useState<StatPillId | null>(null);
  const [syncingStats, setSyncingStats] = useState(false);

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    setDeletingId(messageId);
    setError(null);
    const { error: deleteError } = await supabase.from('chat_messages').delete().eq('id', messageId);
    setDeletingId(null);
    if (deleteError) {
      console.error('Failed to delete message', deleteError);
      setError('That message could not be deleted. Please try again.');
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Silent helper to persist updated story_state to Supabase without sending a chat message
  const persistStoryState = useCallback(async (nextState: Record<string, unknown>) => {
    setPlaythrough((prev) => (prev ? { ...prev, story_state: nextState } : prev));
    const { error: updateErr } = await supabase
      .from('playthroughs')
      .update({
        story_state: nextState,
        updated_at: new Date().toISOString(),
      })
      .eq('id', playthroughId);

    if (updateErr) {
      console.error('Failed to save stat adjustment', updateErr);
    }
  }, [playthroughId]);

  // Re-sync stats from Daily Save Log + any newer chat messages
  const syncStatsFromSaveLog = useCallback(async (currentState?: Record<string, unknown>) => {
    setSyncingStats(true);
    const { data: noteRow } = await supabase
      .from('playthrough_notes')
      .select('content')
      .eq('playthrough_id', playthroughId)
      .eq('tab', 'daily-save-log')
      .maybeSingle();

    const fromLog = noteRow?.content ? parseStatsFromSaveLog(noteRow.content as string) : {};
    const extracted = parseStatsFromChatMessages(messagesRef.current, fromLog);

    if (Object.keys(extracted).length > 0) {
      const baseState = currentState ?? (playthrough?.story_state as Record<string, unknown>) ?? {};
      const mergedState: Record<string, unknown> = {
        ...baseState,
        ...extracted,
      };
      await persistStoryState(mergedState);
    }
    setSyncingStats(false);
  }, [playthroughId, playthrough?.story_state, persistStoryState]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user) {
        setMessages([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setMessages([]);
      const { data: pt, error: ptError } = await supabase
        .from('playthroughs')
        .select('id, character_id, user_id, title, apex_target, status, story_state, current_scene, turn_count, created_at, updated_at')
        .eq('id', playthroughId)
        .maybeSingle();

      if (cancelled) return;
      if (ptError || !pt) {
        setError('This playthrough could not be loaded.');
        setLoading(false);
        return;
      }

      const loadedPt = pt as Playthrough;
      setPlaythrough(loadedPt);

      const { data: char } = await supabase
        .from('characters')
        .select('id, user_id, name, concept, traits, portrait_color, emoji, created_at, updated_at')
        .eq('id', loadedPt.character_id)
        .maybeSingle();

      if (cancelled) return;
      if (char) setCharacter(char as Character);

      const resolvedApex = await resolveApexName(loadedPt.apex_target);
      setApexName(resolvedApex ?? loadedPt.apex_target ?? 'Unknown');

      // Load persisted chat messages
      const { data: msgRows, error: msgError } = await supabase
        .from('chat_messages')
        .select('id, role, content, seq')
        .eq('playthrough_id', playthroughId)
        .order('seq', { ascending: true });

      if (cancelled) return;
      if (msgError) {
        console.error('Failed to load chat messages', msgError);
      }

      const loadedMessages: ChatMessage[] = msgRows
        ? msgRows.map((r) => ({ id: r.id, role: r.role as 'player' | 'narrator', content: r.content, seq: r.seq }))
        : [];

      if (loadedMessages.length > 0) {
        setMessages(loadedMessages);
      }

      // Auto-seed or refresh stats if story_state hasn't tracked them yet
      const st = (loadedPt.story_state ?? {}) as Record<string, unknown>;
      if (st.hp === undefined || st.stamina === undefined || st.level === undefined || st.bond_xp === undefined) {
        const { data: noteRow } = await supabase
          .from('playthrough_notes')
          .select('content')
          .eq('playthrough_id', playthroughId)
          .eq('tab', 'daily-save-log')
          .maybeSingle();

        if (!cancelled) {
          const fromLog = noteRow?.content ? parseStatsFromSaveLog(noteRow.content as string) : {};
          const extracted = parseStatsFromChatMessages(loadedMessages, fromLog);
          if (Object.keys(extracted).length > 0) {
            const seededState = { ...st, ...extracted };
            setPlaythrough((prev) => (prev ? { ...prev, story_state: seededState } : prev));
            await supabase
              .from('playthroughs')
              .update({ story_state: seededState })
              .eq('id', playthroughId);
          }
        }
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [playthroughId, user?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeTab === 'play') {
      chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [activeTab]);

  // --- Stat Values & Threshold Calculations ---
  const rawState = (playthrough?.story_state ?? {}) as Record<string, unknown>;
  const stamina = typeof rawState.stamina === 'number' ? rawState.stamina : 10;
  const maxStamina = typeof rawState.max_stamina === 'number' ? rawState.max_stamina : 10;
  const hp = typeof rawState.hp === 'number' ? rawState.hp : 10;
  const maxHp = typeof rawState.max_hp === 'number' ? rawState.max_hp : 10;
  const level = typeof rawState.level === 'number' ? rawState.level : 1;
  const xp = typeof rawState.xp === 'number' ? rawState.xp : 0;
  const xpTarget = Math.max(100, level * 100); // Level 1 -> 100, Level 4 -> 400

  const bondLevel = typeof rawState.bond_level === 'number' ? Math.max(1, rawState.bond_level) : 1;
  const bondXp = typeof rawState.bond_xp === 'number' ? rawState.bond_xp : 0;
  // Bond 1 -> 10 XP, Bond 2 -> 20 XP ... Bond 5 -> 50 XP
  const bondXpTarget = Math.max(10, bondLevel * 10);

  const stmPercent = Math.max(0, Math.min(100, (stamina / Math.max(1, maxStamina)) * 100));
  const hpPercent = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
  const lvlPercent = Math.max(0, Math.min(100, (xp / xpTarget) * 100));
  const bondPercent = Math.max(0, Math.min(100, (bondXp / bondXpTarget) * 100));

  // --- Silent Stat Adjustment Handlers ---
  const adjustStamina = (delta: number) => {
    const next = Math.max(0, Math.min(maxStamina, stamina + delta));
    persistStoryState({ ...rawState, stamina: next, max_stamina: maxStamina });
  };

  const adjustHp = (delta: number) => {
    const next = Math.max(0, Math.min(maxHp, hp + delta));
    persistStoryState({ ...rawState, hp: next, max_hp: maxHp });
  };

  const adjustLevel = (delta: number) => {
    const nextLvl = Math.max(1, Math.min(20, level + delta));
    persistStoryState({ ...rawState, level: nextLvl });
  };

  const adjustXp = (delta: number) => {
    let nextXp = xp + delta;
    let nextLvl = level;
    const currentTarget = Math.max(100, nextLvl * 100);

    // Auto-rollover if XP reaches the level-up threshold
    if (nextXp >= currentTarget && nextLvl < 20) {
      nextXp -= currentTarget;
      nextLvl += 1;
    } else if (nextXp < 0) {
      nextXp = 0;
    }
    persistStoryState({ ...rawState, level: nextLvl, xp: nextXp });
  };

  const adjustBondLevel = (delta: number) => {
    const nextBond = Math.max(0, Math.min(20, bondLevel + delta));
    persistStoryState({ ...rawState, bond_level: nextBond });
  };

  const adjustBondXp = (delta: number) => {
    let nextBondXp = bondXp + delta;
    let nextBondLvl = bondLevel;
    const currentTarget = Math.max(10, nextBondLvl * 10);

    if (nextBondXp >= currentTarget && nextBondLvl < 20) {
      nextBondXp -= currentTarget;
      nextBondLvl += 1;
    } else if (nextBondXp < 0) {
      nextBondXp = 0;
    }
    persistStoryState({ ...rawState, bond_level: nextBondLvl, bond_xp: nextBondXp });
  };

  const handleSend = async () => {
    if (!input.trim() || sending || !character || !playthrough) return;

    const currentSeq = nextSeqFor(messagesRef.current);
    const currentInput = input.trim();
    const playerMessage: ChatMessage = { id: null, role: 'player', content: currentInput, seq: currentSeq };
    setMessages((prev) => [...prev, playerMessage]);
    const usingGentleDay = gentleDayRef.current;
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    if (usingGentleDay) {
      gentleDayRef.current = false;
      setGentleDay(false);
    }
    setSending(true);
    setError(null);

    // Persist the player's message
    const { data: playerRow, error: playerSaveError } = await supabase
      .from('chat_messages')
      .insert({
        playthrough_id: playthrough.id,
        role: 'player',
        content: currentInput,
        seq: currentSeq,
      })
      .select('id')
      .single();

    if (playerRow) {
      setMessages((prev) => prev.map((m) => (m === playerMessage ? { ...m, id: playerRow.id } : m)));
    }

    if (playerSaveError) {
      console.error('Failed to save player message', playerSaveError);
      if (playerSaveError.code === 'PGRST301' || playerSaveError.message.includes('JWT')) {
        setError('Your session has expired. Please sign out and sign back in — your last message was not saved.');
      } else {
        setError('Your message could not be saved. Please try again.');
      }
      setSending(false);
      return;
    }

    try {
      // Look up the bound model preference for the user's active key
      let chosenModelId: string | undefined;
      if (user) {
        const { data: activeKeyRow } = await supabase
          .from('user_ai_keys_safe')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();
        if (activeKeyRow?.id) {
          chosenModelId = localStorage.getItem(`model_pref_${activeKeyRow.id}`) ?? undefined;
        }
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/narrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          playthroughId: playthrough.id,
          characterName: character.name,
          characterConcept: character.concept ?? '',
          characterTraits: character.traits,
          apexTarget: playthrough.apex_target ?? '',
          currentScene: playthrough.current_scene,
          storyState: playthrough.story_state,
          playerInput: currentInput,
          gentleDay: usingGentleDay,
          conversationHistory: messagesRef.current,
          aiModel: chosenModelId,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `The narrator could not respond (${response.status}).`);
      }

      const data = await response.json();
      if (!data.narration) {
        throw new Error('The narrator returned an empty response. Try again or check your AI key in AI Configuration.');
      }

      const narratorMessage: ChatMessage = {
        id: null,
        role: 'narrator',
        content: data.narration,
        seq: currentSeq + 1,
      };

      if (data.storyState && typeof data.storyState === 'object') {
        const incomingState = data.storyState as Record<string, unknown>;
        // Also run client-side extraction on the new narrator message as a backup
        const clientParsed = parseStatsFromChatMessages([narratorMessage], incomingState as ParsedStats);
        const finalMergedState = { ...incomingState, ...clientParsed };

        setPlaythrough((prev) =>
          prev
            ? {
                ...prev,
                story_state: finalMergedState,
                turn_count: typeof data.turnCount === 'number' ? data.turnCount : prev.turn_count,
              }
            : prev,
        );

        // Save the frontend-parsed stats directly to Supabase so they survive page refreshes
        void persistStoryState(finalMergedState);
      }

      // Persist the narrator's message
      const { data: narrRow, error: narrSaveError } = await supabase
        .from('chat_messages')
        .insert({
          playthrough_id: playthrough.id,
          role: 'narrator',
          content: data.narration,
          seq: currentSeq + 1,
        })
        .select('id')
        .single();

      if (narrSaveError) {
        console.error('Failed to save narrator message', narrSaveError);
      }

      narratorMessage.id = narrRow?.id ?? null;
      setMessages((prev) => [...prev, narratorMessage]);
    } catch (err) {
      console.error('Narrate error', err);
      setError(err instanceof Error ? err.message : 'The story could not continue. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleClearChat = async () => {
    setError(null);
    setShowClearConfirm(false);
    const { error: clearError } = await supabase
      .from('chat_messages')
      .delete()
      .eq('playthrough_id', playthroughId);
    if (clearError) {
      setError('Could not clear the chat. Please try again.');
      return;
    }
    setMessages([]);
  };

  const handleToggleGentleDay = () => {
    const next = !gentleDayRef.current;
    gentleDayRef.current = next;
    setGentleDay(next);
  };

  const handleRollDice = () => {
    const roll = Math.floor(Math.random() * 20) + 1;
    setInput((prev) => {
      if (/\(\(d20=[\d,\s]+,\s*$/.test(prev)) {
        return `${prev}${roll}))`;
      }
      const closedRollRegex = /(\(\(d20=(?:[\d]+\s*,\s*)*)\d+(\)\)\s*)$/;
      if (closedRollRegex.test(prev)) {
        return prev.replace(closedRollRegex, `$1${roll}$2`);
      }
      return prev.trim() ? `${prev} ((d20=${roll}))` : `((d20=${roll}))`;
    });

    setTimeout(() => {
      autoGrow();
      textareaRef.current?.focus();
    }, 0);
  };

  if (loading) {
    return (
      <main className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          Diving into the deep...
        </div>
      </main>
    );
  }

  if (error && !playthrough) {
    return (
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-coral-300">{error}</p>
        <button onClick={onBack} className="rounded-lg bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400">
          Go Back
        </button>
      </main>
    );
  }

  return (
    <main className="relative z-10 flex h-[100dvh] flex-col overflow-hidden">
      {/* Header bar — stays fixed at top as a flex child */}
      <div className="relative z-30 shrink-0 border-b border-abyss-700/30 bg-abyss-950/85 px-3 pt-3 backdrop-blur-md sm:px-6 sm:pt-5">
        <div className="mx-auto max-w-4xl">
          {/* Top Row: Surface Button + Character Info */}
          <div className="flex items-center justify-between gap-3 pb-2.5">
            <button
              onClick={onBack}
              className="group inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-pearl"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              Surface
            </button>
            <div className="flex min-w-0 items-center gap-2.5 text-right sm:gap-3">
              <button
                onClick={onReportBug}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-abyss-600/40 text-muted transition-colors hover:border-abyss-300/50 hover:bg-abyss-800/50 hover:text-pearl"
                aria-label="Report a bug"
                title="Report a bug"
              >
                <Bug className="h-4 w-4" />
              </button>
              {activeTab === 'play' && messages.length > 0 && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-coral-400/30 bg-coral-900/20 text-coral-300 transition-all hover:border-coral-300/60 hover:bg-coral-800/40"
                  aria-label="Clear chat history"
                  title="Clear chat history"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold text-pearl sm:text-lg">
                  {character?.emoji ? `${character.emoji} ` : ''}{character?.name ?? 'Unknown'}
                </p>
                <p className="truncate text-[11px] text-muted sm:text-xs">Romancing {apexName}</p>
              </div>
            </div>
          </div>

          {/* Bottom Row: Liquid-Fill Stat Tracker Pills (Stm / HP on Left, Lvl / Bond on Right) */}
          <div className="flex items-center justify-between gap-2 border-t border-abyss-800/50 py-2">
            {/* Left Group: Stamina & HP */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* STAMINA CAPSULE */}
              <button
                type="button"
                onClick={() => setOpenStatPill((prev) => (prev === 'stamina' ? null : 'stamina'))}
                className={`relative overflow-hidden rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-all sm:px-3 sm:text-xs ${
                  openStatPill === 'stamina'
                    ? 'border-emerald-300 bg-emerald-950/80 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                    : 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200 hover:border-emerald-400/70'
                }`}
                title="Tap to view or adjust Stamina"
              >
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/45 to-teal-400/35 transition-all duration-300"
                  style={{ width: `${stmPercent}%` }}
                />
                <span className="relative z-10 font-mono">
                  Stm {stamina}/{maxStamina}
                </span>
              </button>

              {/* HP CAPSULE */}
              <button
                type="button"
                onClick={() => setOpenStatPill((prev) => (prev === 'hp' ? null : 'hp'))}
                className={`relative overflow-hidden rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-all sm:px-3 sm:text-xs ${
                  openStatPill === 'hp'
                    ? 'border-rose-300 bg-rose-950/80 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.35)]'
                    : 'border-rose-500/40 bg-rose-950/40 text-rose-200 hover:border-rose-400/70'
                }`}
                title="Tap to view or adjust Health"
              >
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-rose-600/50 to-coral-500/35 transition-all duration-300"
                  style={{ width: `${hpPercent}%` }}
                />
                <span className="relative z-10 font-mono">
                  HP {hp}/{maxHp}
                </span>
              </button>
            </div>

            {/* Right Group: Level & Bond */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* LEVEL CAPSULE (Fills by XP %) */}
              <button
                type="button"
                onClick={() => setOpenStatPill((prev) => (prev === 'level' ? null : 'level'))}
                className={`relative min-w-[62px] overflow-hidden rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-all sm:min-w-[72px] sm:px-3 sm:text-xs ${
                  openStatPill === 'level'
                    ? 'border-cyan-300 bg-cyan-950/80 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.35)]'
                    : 'border-cyan-400/40 bg-cyan-950/40 text-cyan-200 hover:border-cyan-300/70'
                }`}
                title={`Level ${level} (${xp}/${xpTarget} XP)`}
              >
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500/50 to-sky-400/40 transition-all duration-300"
                  style={{ width: `${lvlPercent}%` }}
                />
                <span className="relative z-10 font-mono">
                  Lvl {level}
                </span>
              </button>

              {/* BOND CAPSULE (Fills by Bond XP %) */}
              <button
                type="button"
                onClick={() => setOpenStatPill((prev) => (prev === 'bond' ? null : 'bond'))}
                className={`relative min-w-[66px] overflow-hidden rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-all sm:min-w-[76px] sm:px-3 sm:text-xs ${
                  openStatPill === 'bond'
                    ? 'border-purple-300 bg-purple-950/80 text-purple-100 shadow-[0_0_12px_rgba(168,85,247,0.35)]'
                    : 'border-purple-400/40 bg-purple-950/40 text-purple-200 hover:border-purple-300/70'
                }`}
                title={`Bond ${bondLevel} (${bondXp}/${bondXpTarget} XP)`}
              >
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500/50 to-fuchsia-400/35 transition-all duration-300"
                  style={{ width: `${bondPercent}%` }}
                />
                <span className="relative z-10 font-mono">
                  Bond {bondLevel}
                </span>
              </button>
            </div>
          </div>

          {/* --- INTERACTIVE STAT ADJUSTMENT POPOVER --- */}
          {openStatPill && (
            <div className="mb-2.5 rounded-xl border border-abyss-500/40 bg-abyss-900/95 p-3.5 shadow-xl backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between border-b border-abyss-700/50 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-display text-xs font-semibold uppercase tracking-wider text-pearl">
                    {openStatPill === 'stamina' && 'Stamina Tracker'}
                    {openStatPill === 'hp' && 'Health (HP) Tracker'}
                    {openStatPill === 'level' && 'Global Level & XP'}
                    {openStatPill === 'bond' && `Bond Tracker (${apexName})`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => syncStatsFromSaveLog()}
                    disabled={syncingStats}
                    className="inline-flex items-center gap-1 rounded-md border border-abyss-600/50 bg-abyss-800/50 px-2 py-1 text-[10px] font-medium text-foam-300 transition-colors hover:border-foam-400/50 hover:text-pearl disabled:opacity-50"
                    title="Pull latest numbers from your Save Log and Chat"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncingStats ? 'animate-spin' : ''}`} />
                    Sync from Save &amp; Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenStatPill(null)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted hover:text-pearl"
                    aria-label="Close tracker"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* STAMINA CONTROLS */}
              {openStatPill === 'stamina' && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted">
                    Drains during travel, foraging, and storms. At <span className="text-emerald-300">0/10</span>, exhaustion penalties apply.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => adjustStamina(-1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-950/50 text-emerald-200 hover:bg-emerald-900/60"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[60px] text-center font-mono text-sm font-semibold text-pearl">
                      {stamina} / {maxStamina}
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustStamina(1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-950/50 text-emerald-200 hover:bg-emerald-900/60"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* HP CONTROLS */}
              {openStatPill === 'hp' && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted">
                    Physical integrity. Silent adjustments update the AI's scene logic on your next turn without posting to chat.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => adjustHp(-1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-950/50 text-rose-200 hover:bg-rose-900/60"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[60px] text-center font-mono text-sm font-semibold text-pearl">
                      {hp} / {maxHp}
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustHp(1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-950/50 text-rose-200 hover:bg-rose-900/60"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* LEVEL & XP CONTROLS */}
              {openStatPill === 'level' && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted">
                      Global Level (Skill Bonus: <strong className="text-cyan-300">+{Math.floor(level / 4)}</strong>)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => adjustLevel(-1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-cyan-500/40 bg-cyan-950/50 text-cyan-200 hover:bg-cyan-900/60"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="min-w-[54px] text-center font-mono text-xs font-semibold text-pearl">
                        Lvl {level}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustLevel(1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-cyan-500/40 bg-cyan-950/50 text-cyan-200 hover:bg-cyan-900/60"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-abyss-800/60 pt-2">
                    <span className="text-xs text-muted">
                      Current XP (<span className="font-mono text-cyan-300">{Math.round(lvlPercent)}%</span> to Lvl {level + 1})
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => adjustXp(-10)}
                        className="rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2 py-1 font-mono text-[11px] text-cyan-200 hover:bg-cyan-900/50"
                      >
                        -10
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustXp(-1)}
                        className="rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2 py-1 font-mono text-[11px] text-cyan-200 hover:bg-cyan-900/50"
                      >
                        -1
                      </button>
                      <span className="min-w-[82px] text-center font-mono text-xs font-semibold text-pearl">
                        {xp} / {xpTarget}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustXp(1)}
                        className="rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2 py-1 font-mono text-[11px] text-cyan-200 hover:bg-cyan-900/50"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustXp(10)}
                        className="rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2 py-1 font-mono text-[11px] text-cyan-200 hover:bg-cyan-900/50"
                      >
                        +10
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* BOND LEVEL & BOND XP CONTROLS */}
              {openStatPill === 'bond' && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted">
                      Bond Tier with <strong className="text-purple-300">{apexName}</strong>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => adjustBondLevel(-1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-purple-500/40 bg-purple-950/50 text-purple-200 hover:bg-purple-900/60"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="min-w-[58px] text-center font-mono text-xs font-semibold text-pearl">
                        Bond {bondLevel}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustBondLevel(1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-purple-500/40 bg-purple-950/50 text-purple-200 hover:bg-purple-900/60"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-abyss-800/60 pt-2">
                    <span className="text-xs text-muted">
                      Bond XP (<span className="font-mono text-purple-300">{Math.round(bondPercent)}%</span> to Bond {bondLevel + 1})
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => adjustBondXp(-5)}
                        className="rounded-md border border-purple-500/30 bg-purple-950/40 px-2 py-1 font-mono text-[11px] text-purple-200 hover:bg-purple-900/50"
                      >
                        -5
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustBondXp(-1)}
                        className="rounded-md border border-purple-500/30 bg-purple-950/40 px-2 py-1 font-mono text-[11px] text-purple-200 hover:bg-purple-900/50"
                      >
                        -1
                      </button>
                      <span className="min-w-[74px] text-center font-mono text-xs font-semibold text-pearl">
                        {bondXp} / {bondXpTarget}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustBondXp(1)}
                        className="rounded-md border border-purple-500/30 bg-purple-950/40 px-2 py-1 font-mono text-[11px] text-purple-200 hover:bg-purple-900/50"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustBondXp(5)}
                        className="rounded-md border border-purple-500/30 bg-purple-950/40 px-2 py-1 font-mono text-[11px] text-purple-200 hover:bg-purple-900/50"
                      >
                        +5
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-3 pt-6 pb-44 sm:px-6 sm:pt-8 sm:pb-48">
        <div className="mx-auto max-w-4xl">
          {activeTab === 'play' ? (
            <div className="flex flex-col gap-4">
              {messages.length === 0 && (
                <div className="glass-panel rounded-2xl p-6 text-center sm:p-10">
                  <Waves className="mx-auto mb-4 h-8 w-8 text-abyss-300/60" />
                  <h2 className="font-display text-2xl font-semibold text-pearl sm:text-3xl">Your Story Begins</h2>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
                    Type your action below to begin your journey through the dark ocean. The narrator will respond and guide your story.
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={msg.id ?? `local-${i}`}
                  className={`group relative rounded-2xl border p-4 sm:p-5 ${
                    msg.role === 'narrator'
                      ? 'border-abyss-600/30 bg-abyss-950/40'
                      : 'border-abyss-400/30 bg-abyss-600/20'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${msg.role === 'narrator' ? 'text-abyss-300/70' : 'text-abyss-200/70'}`}>
                      {msg.role === 'narrator' ? 'Narrator' : 'You'}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopy(msg.content, i)}
                        className="opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center h-6 w-6 rounded-md text-muted hover:text-pearl hover:bg-abyss-700/50"
                        title="Copy message"
                      >
                        {copiedIndex === i ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      {msg.id && (
                        <button
                          onClick={() => handleDeleteMessage(msg.id!)}
                          disabled={deletingId === msg.id}
                          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40 flex items-center justify-center h-6 w-6 rounded-md text-muted hover:text-coral-300 hover:bg-coral-900/30"
                          title="Delete message"
                          aria-label="Delete message"
                        >
                          {deletingId === msg.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                  {msg.role === 'narrator' ? (
                    <MarkdownNarrative content={msg.content} fontFamilyClass={fontFamilyClass} fontPx={fontPx} />
                  ) : (
                    <p className={`whitespace-pre-wrap text-pearl/90 ${fontFamilyClass}`} style={{ fontSize: fontPx }}>{msg.content}</p>
                  )}
                </div>
              ))}

              {sending && (
                <div className="rounded-2xl border border-abyss-600/30 bg-abyss-950/40 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className={fontFamilyClass} style={{ fontSize: fontPx }}>The narrator is weaving your story...</span>
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-300">{error}</p>
              )}

              <div ref={chatEndRef} />
            </div>
          ) : activeTab === 'daily-save-log' ? (
            <DailySaveLog playthroughId={playthroughId} onSignIn={onSignIn} />
          ) : activeTab === 'grotto-registry' ? (
            <GrottoRegistry playthroughId={playthroughId} onSignIn={onSignIn} />
          ) : activeTab === 'narrative-summaries' ? (
            <NarrativeSummaries playthroughId={playthroughId} onSignIn={onSignIn} />
          ) : activeTab === 'extras' ? (
            <ExtrasPanel playthroughId={playthroughId} onSignIn={onSignIn} />
          ) : (
            (() => {
              const noteTab = noteTabs.find((t) => t.id === activeTab)!;
              return (
                <NotesPanel
                  playthroughId={playthroughId}
                  tab={noteTab.id}
                  title={noteTab.title}
                  label={noteTab.label}
                  description={noteTab.description}
                  onSignIn={onSignIn}
                />
              );
            })()
          )}
        </div>
      </div>

      {/* Chat input (only on play tab) — fixed above the nav bar */}
      {activeTab === 'play' && (
        <div className="fixed inset-x-0 bottom-14 z-40 border-t border-abyss-700/30 bg-abyss-950/90 px-3 py-3 backdrop-blur-md sm:px-6 sm:py-4">
          <div className="mx-auto max-w-4xl">
            <div className="relative">
              <button
                onClick={handleRollDice}
                disabled={sending || !user}
                className="absolute left-2.5 bottom-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-foam-400/80 transition-colors hover:text-foam-300 hover:bg-foam-900/30 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Roll d20"
                title="Roll d20"
              >
                <Dices className="h-[18px] w-[18px]" />
              </button>
              <button
                onClick={handleToggleGentleDay}
                disabled={sending || !user}
                className={`absolute left-11 bottom-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  gentleDay
                    ? 'text-amber-300 bg-amber-900/40'
                    : 'text-foam-400/60 hover:text-foam-300 hover:bg-foam-900/30'
                }`}
                aria-label="Gentle day"
                title={gentleDay ? 'Gentle day armed — this turn will be gentle' : 'Make next turn gentle'}
              >
                <Sun className="h-[18px] w-[18px]" />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); autoGrow(); }}
                placeholder={user ? 'What does your mermaid do?' : 'Sign in to begin playing...'}
                disabled={sending || !user}
                rows={1}
                className="min-h-12 max-h-40 w-full resize-none overflow-y-auto rounded-xl border border-abyss-600/40 bg-abyss-900/60 px-20 py-3 text-sm leading-relaxed text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60 disabled:opacity-50"
              />
              <button
                onClick={user ? handleSend : onSignIn}
                disabled={sending || (!user ? false : !input.trim())}
                className="absolute right-2.5 bottom-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-pearl/70 transition-colors hover:text-pearl hover:bg-abyss-700/40 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send"
                title="Send"
              >
                {sending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
              </button>
            </div>
            {gentleDay && (
              <p className="mt-2 text-center text-xs text-amber-300/80">
                Gentle day is armed for your next turn.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Clear chat confirmation modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-abyss-950/80 px-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-coral-400/30 bg-coral-900/20">
                  <AlertTriangle className="h-5 w-5 text-coral-300" />
                </div>
                <h3 className="font-display text-lg font-semibold text-pearl">Clear chat history?</h3>
              </div>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-pearl"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              This will permanently clear the entire chat. Anything you haven't recorded to your
              save log, narrative summaries, grotto registry, or other tabs will be lost.
              This helps reduce token weight and improve load times.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleClearChat}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-coral-600/80 px-4 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-coral-500"
              >
                <Trash2 className="h-4 w-4" />
                Yes, clear it
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-abyss-600/40 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-abyss-700/40 bg-abyss-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-stretch justify-between gap-1 px-1 sm:gap-2 sm:px-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-t-lg px-1 py-2 text-[10px] font-medium transition-all sm:text-xs ${
                  isActive
                    ? 'text-pearl'
                    : 'text-muted/70 hover:text-pearl'
                }`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                  isActive
                    ? 'bg-abyss-500/30 text-pearl'
                    : 'text-muted/70 group-hover:bg-abyss-700/40 group-hover:text-pearl'
                }`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="hidden sm:block">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}