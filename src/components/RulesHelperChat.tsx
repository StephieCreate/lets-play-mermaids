import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatScrollBottom } from '@/hooks/useChatScrollBottom';
import {
  BookOpenCheck,
  Check,
  Copy,
  Eraser,
  Layers,
  Loader2,
  LockKeyhole,
  Send,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAiPreferences } from '@/context/AiPreferencesContext';
import { useFontSettings } from '@/context/FontSettingsContext';
import { supabase } from '@/lib/supabase';
import { handleChatKeyDown } from '@/lib/deviceInput';

interface SourceChip {
  docTitle: string;
  heading: string;
}

interface ChatMessage {
  id: string | null;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceChip[];
  usedCharacters?: boolean;
  characterNames?: string[];
  deleting?: boolean;
}

const CHAT_TYPE = 'rules_helper';
const MAX_HISTORY = 10;
const MAX_SAVED_MESSAGES = 200;

const QUICK_PROMPTS = [
  'How does the Bond system work?',
  'What happens when I sleep?',
  'How do encounter rolls work?',
  'Explain Legacy Marks',
  'Draft a homebrew item for my grotto',
  'How do waystations and travel work?',
];

interface SavedAssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: {
    sources?: SourceChip[];
    usedCharacters?: boolean;
    characterNames?: string[];
  } | null;
}

async function fetchSavedMessages(userId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('assistant_chat_messages')
    .select('id, role, content, metadata')
    .eq('user_id', userId)
    .eq('chat_type', CHAT_TYPE)
    .order('created_at', { ascending: true })
    .limit(MAX_SAVED_MESSAGES);
  if (error) {
    console.error('Could not load saved helper chat', error);
    return [];
  }
  const rows = (data ?? []) as SavedAssistantMessage[];
  return rows.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      role: row.role,
      content: row.content ?? '',
      sources: Array.isArray(meta.sources) ? (meta.sources as SourceChip[]) : [],
      usedCharacters: meta.usedCharacters === true,
      characterNames: Array.isArray(meta.characterNames)
        ? (meta.characterNames as unknown[]).filter((n): n is string => typeof n === 'string')
        : [],
    };
  });
}

async function insertAssistantMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  metadata: ChatMessage,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('assistant_chat_messages')
    .insert({
      user_id: userId,
      chat_type: CHAT_TYPE,
      role,
      content,
      metadata: {
        sources: metadata.sources ?? [],
        usedCharacters: metadata.usedCharacters ?? false,
        characterNames: metadata.characterNames ?? [],
      },
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('Could not save helper chat message', error);
    return null;
  }
  return (data as { id: string }).id;
}

async function deleteAssistantMessage(rowId: string): Promise<boolean> {
  const { error } = await supabase
    .from('assistant_chat_messages')
    .delete()
    .eq('id', rowId)
    .eq('chat_type', CHAT_TYPE);
  if (error) {
    console.error('Could not delete helper chat message', error);
    return false;
  }
  return true;
}

async function clearAssistantMessages(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('assistant_chat_messages')
    .delete()
    .eq('user_id', userId)
    .eq('chat_type', CHAT_TYPE);
  if (error) {
    console.error('Could not clear helper chat', error);
    return false;
  }
  return true;
}

// Minimal safe markdown renderer: headings, bold, inline code, lists, fences.
function InlineText({ text }: { text: string }) {
  const nodes: Array<React.ReactNode> = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key++} className="font-semibold text-pearl">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code key={key++} className="rounded bg-abyss-950/80 px-1.5 py-0.5 font-mono text-[0.85em] text-foam-200">
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return <>{nodes}</>;
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="relative my-2">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-md border border-abyss-500/40 bg-abyss-900/90 px-2 text-[11px] font-medium text-muted transition-colors hover:text-pearl"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-abyss-600/40 bg-abyss-950/80 p-3 pr-16 font-mono text-xs leading-6 text-foam-100">
        {code}
      </pre>
    </div>
  );
}

function AssistantMarkdown({ content }: { content: string }) {
  const blocks = useMemo(() => {
    const segments: Array<{ type: 'code' | 'text'; body: string }> = [];
    const fence = /```(?:[a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = fence.exec(content)) !== null) {
      if (match.index > lastIndex) segments.push({ type: 'text', body: content.slice(lastIndex, match.index) });
      segments.push({ type: 'code', body: match[1] });
      lastIndex = fence.lastIndex;
    }
    if (lastIndex < content.length) segments.push({ type: 'text', body: content.slice(lastIndex) });
    return segments;
  }, [content]);

  return (
    <div className="space-y-2">
      {blocks.map((segment, si) => {
        if (segment.type === 'code') return <CodeBlock key={`b-${si}`} code={segment.body} />;

        const lines = segment.body.split('\n');
        const elements: Array<React.ReactNode> = [];
        let bullets: string[] = [];

        const flushBullets = (key: string) => {
          if (bullets.length === 0) return;
          elements.push(
            <ul key={key} className="my-1 list-disc space-y-1 pl-5">
              {bullets.map((item, bi) => (
                <li key={`${key}-${bi}`} className="leading-relaxed">
                  <InlineText text={item} />
                </li>
              ))}
            </ul>,
          );
          bullets = [];
        };

        lines.forEach((rawLine, li) => {
          const line = rawLine.trimEnd();
          const heading = line.match(/^(#{1,4})\s+(.*)$/);
          const bullet = line.match(/^\s*[-*•]\s+(.*)$/);

          if (bullet) {
            bullets.push(bullet[1]);
            return;
          }
          flushBullets(`ul-${si}-${li}`);
          if (heading) {
            elements.push(
              <h4 key={`h-${si}-${li}`} className="mt-2 text-sm font-semibold text-pearl">
                <InlineText text={heading[2]} />
              </h4>,
            );
            return;
          }
          if (line.trim() === '') return;
          elements.push(
            <p key={`p-${si}-${li}`} className="leading-relaxed">
              <InlineText text={line} />
            </p>,
          );
        });
        flushBullets(`ul-${si}-end`);

        return <div key={`s-${si}`}>{elements}</div>;
      })}
    </div>
  );
}

export default function RulesHelperChat({ onSignIn }: { onSignIn: () => void }) {
  const { user } = useAuth();
  const { activePreference } = useAiPreferences();
  const { fontFamilyClass, fontPx } = useFontSettings();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [savedCharacters, setSavedCharacters] = useState<Array<{ id: string; name: string }>>([]);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [modelLabel, setModelLabel] = useState('');

  const { containerRef: feedRef, scrollToBottom: scrollToFeedBottom } = useChatScrollBottom<HTMLDivElement>(
    messages.length,
    { disabled: historyLoading },
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setMessages([]);
      setHistoryLoading(false);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    fetchSavedMessages(userId).then((saved) => {
      if (!cancelled) setMessages(saved);
      setHistoryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // The useChatScrollBottom hook handles bottom-anchoring for new messages,
  // mount-with-history, tab switches, visibility, and rotation/resize.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from('user_ai_keys_safe')
      .select('id, provider, label')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const savedPref =
          activePreference !== null &&
          activePreference.provider === data.provider &&
          activePreference.model
            ? activePreference.model
            : null;
        const modelPref = savedPref ?? localStorage.getItem(`model_pref_${data.id}`);
        setModelLabel(modelPref || data.label || data.provider || '');
      });
    return () => {
      cancelled = true;
    };
  }, [userId, activePreference]);

  // Populate the Character Context picker with the player's saved characters
  useEffect(() => {
    if (!userId) {
      setSavedCharacters([]);
      setSelectedCharacterId('');
      return;
    }
    let cancelled = false;
    supabase
      .from('characters')
      .select('id, name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setSavedCharacters(((data ?? []) as Array<{ id: string; name: string }>).filter((c) => c.name));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const clearChat = async () => {
    if (!user) return;
    setMessages([]);
    setConfirmClear(false);
    setError(null);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    await clearAssistantMessages(user.id);
  };

  const copyMessage = (content: string, idx: number) => {
    void navigator.clipboard.writeText(content);
    setCopiedIndex(idx);
    window.setTimeout(() => setCopiedIndex(null), 1800);
  };

  const deleteMessage = async (idx: number) => {
    const target = messages[idx];
    if (!target?.id) {
      setMessages((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, deleting: true } : m)));
    const ok = await deleteAssistantMessage(target.id);
    if (ok) {
      setMessages((prev) => prev.filter((_, i) => i !== idx));
    } else {
      setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, deleting: false } : m)));
      setError('That message could not be deleted. Please try again.');
    }
  };

  const sendMessage = useCallback(
    async (history: ChatMessage[], rawMessage: string, characterId: string): Promise<boolean> => {
      setSending(true);
      setError(null);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('Your session expired. Sign in again and try again.');
        if (!user) throw new Error('Your session expired. Sign in again and try again.');

        let aiModel: string | undefined;
        const { data: activeKeyRow } = await supabase
          .from('user_ai_keys_safe')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();
        if (activeKeyRow?.id) {
          aiModel =
            (activePreference?.provider && activePreference.model
              ? activePreference.model
              : localStorage.getItem(`model_pref_${activeKeyRow.id}`)) ?? undefined;
        }

        let requestType: string | undefined;
        if (/blank.{0,24}apex|apex.{0,24}template/i.test(rawMessage)) requestType = 'blank_apex_template';
        else if (/help me build an extra|build an extra|extra content/i.test(rawMessage)) requestType = 'extra_help';

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rules-helper`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: rawMessage,
            history: history.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content })),
            selectedCharacterIds: characterId ? [characterId] : [],
            requestType,
            aiModel,
          }),
          signal: controller.signal,
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || `The Rules Helper could not respond (${response.status}).`);
        }
        if (!data?.reply) {
          throw new Error('The Rules Helper returned an empty response. Try again.');
        }
        const assistantMeta: ChatMessage = {
          id: null,
          role: 'assistant',
          content: data.reply,
          sources: Array.isArray(data.sources) ? data.sources : [],
          usedCharacters: Boolean(data.usedCharacters),
          characterNames: Array.isArray(data.characterNames)
            ? (data.characterNames as unknown[]).filter((n): n is string => typeof n === 'string')
            : [],
        };
        const savedId = await insertAssistantMessage(user.id, 'assistant', data.reply, assistantMeta);
        setMessages([...history, { ...assistantMeta, id: savedId }]);
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return true;
        }
        setError(
          err instanceof Error
            ? err.message
            : 'The Rules Helper could not respond. If you have no active AI key, add one in AI Configuration first.',
        );
      } finally {
        setSending(false);
        abortControllerRef.current = null;
      }
      return false;
    },
    [user, activePreference],
  );

  const autoGrowInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || sending || !user) return;
    const optimistic: ChatMessage = { id: null, role: 'user', content: text };
    const nextHistory = [...messages, optimistic];
    setMessages(nextHistory);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    void (async () => {
      const savedId = await insertAssistantMessage(user.id, 'user', text, optimistic);
      if (savedId) {
        setMessages((prev) => prev.map((m) => (m === optimistic ? { ...m, id: savedId } : m)));
      }
      const aborted = await sendMessage(nextHistory, text, selectedCharacterId);
      if (aborted) {
        setInput(text);
        if (inputRef.current) inputRef.current.style.height = 'auto';
        setMessages((prev) => {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].role === 'user' && prev[i].content === text) {
              const next = prev.slice();
              next.splice(i, 1);
              return next;
            }
          }
          return prev;
        });
        if (savedId) await deleteAssistantMessage(savedId);
        window.setTimeout(() => autoGrowInput(), 0);
      }
    })();
  };

  const handleChip = (chip: string) => {
    if (sending || !user) return;
    const optimistic: ChatMessage = { id: null, role: 'user', content: chip };
    const nextHistory = [...messages, optimistic];
    setMessages(nextHistory);
    setShowQuickPrompts(false);
    void (async () => {
      const savedId = await insertAssistantMessage(user.id, 'user', chip, optimistic);
      if (savedId) {
        setMessages((prev) => prev.map((m) => (m === optimistic ? { ...m, id: savedId } : m)));
      }
      await sendMessage(nextHistory, chip, selectedCharacterId);
    })();
  };

  if (!user) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6">
        <section className="glass-panel mx-auto max-w-3xl rounded-2xl p-5 sm:p-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-abyss-700/40 text-foam-300">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-semibold text-pearl">Ask the Rules Helper</h2>
              <p className="text-xs text-muted">
                Uses your active AI key • Looks up rules on demand • Saved to your account
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/30 p-6 text-center">
            <LockKeyhole className="mx-auto mb-3 h-7 w-7 text-abyss-300/70" />
            <h3 className="font-display text-lg font-medium text-pearl">Sign in required</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              Sign in to chat with the Rules Helper — your on-demand guide to the core rules, your
              characters, and building Extras.
            </p>
            <button
              type="button"
              onClick={onSignIn}
              className="mt-5 min-h-11 rounded-xl bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400"
            >
              Sign in to continue
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden lg:mx-auto lg:max-w-4xl lg:glass-panel lg:rounded-2xl">
      {/* PINNED COMPACT TOP BAR */}
      <div className="shrink-0 border-b border-abyss-700/35 bg-abyss-950/80 px-3 py-2 backdrop-blur-xl sm:px-5 sm:py-3 lg:bg-transparent lg:backdrop-blur-none">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-abyss-700/40 text-foam-300 sm:h-9 sm:w-9 sm:rounded-xl">
              <BookOpenCheck className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-display text-base font-semibold leading-tight text-pearl sm:text-xl">
                Rules Helper
              </h2>
              <p className="hidden truncate text-xs text-muted sm:block">
                Uses your active AI key • Looks up rules on demand • Saved to your account
                {modelLabel ? ` • ${modelLabel}` : ''}
              </p>
            </div>
          </div>

          {confirmClear ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs text-coral-300">Clear?</span>
              <button
                type="button"
                onClick={clearChat}
                className="rounded-lg bg-coral-500/25 px-2.5 py-1 text-xs font-semibold text-coral-200 transition-colors hover:bg-coral-500/40"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg border border-abyss-400/30 px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:text-pearl"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={messages.length === 0}
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-abyss-500/35 bg-abyss-800/40 px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:text-pearl disabled:opacity-40 sm:min-h-9 sm:px-3"
            >
              <Eraser className="h-3.5 w-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* SLIM CHARACTER CONTEXT + QUICK PROMPTS STRIP */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Users className="h-3.5 w-3.5 shrink-0 text-foam-300/75" />
            <label htmlFor="character-context" className="hidden shrink-0 text-xs font-medium text-muted sm:inline">
              Character
            </label>
            <select
              id="character-context"
              value={selectedCharacterId}
              onChange={(e) => setSelectedCharacterId(e.target.value)}
              disabled={savedCharacters.length === 0}
              aria-label="Character context"
              className="min-h-8 min-w-0 flex-1 rounded-lg border border-abyss-600/40 bg-abyss-950/70 px-2 py-1 text-xs text-pearl outline-none transition-colors focus:border-abyss-400/60 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-[16rem]"
            >
              {savedCharacters.length === 0 ? (
                <option value="">No saved characters</option>
              ) : (
                <>
                  <option value="" className="bg-abyss-900 text-pearl">
                    No character (Rules only)
                  </option>
                  {savedCharacters.map((character) => (
                    <option key={character.id} value={character.id} className="bg-abyss-900 text-pearl">
                      {character.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowQuickPrompts((v) => !v)}
            className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              showQuickPrompts
                ? 'border-foam-400/50 bg-foam-900/30 text-foam-200'
                : 'border-abyss-500/35 bg-abyss-800/40 text-foam-300/85 hover:text-foam-200'
            }`}
          >
            {showQuickPrompts ? 'Hide prompts' : '+ Prompts'}
          </button>
        </div>
      </div>

      {/* ONLY SCROLLABLE CHAT FEED */}
      <div
        ref={feedRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4"
      >
        {historyLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your saved conversation...
          </div>
        ) : (
          <>
            {messages.length === 0 && !sending && (
              <div className="rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/30 p-4 text-center sm:p-5">
                <p className="mb-3 text-sm text-muted">
                  Ask anything about the rules — answers cite the exact rule section they came from.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {QUICK_PROMPTS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleChip(chip)}
                      className="rounded-full border border-foam-400/30 bg-foam-900/20 px-3 py-1.5 text-xs font-medium text-foam-200 transition-colors hover:bg-foam-900/40"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, idx) => (
              <div
                key={message.id ?? `local-${idx}`}
                className={`group relative min-w-0 rounded-2xl border p-3.5 sm:p-5 ${
                  message.role === 'user'
                    ? 'border-abyss-400/30 bg-abyss-600/20'
                    : 'border-abyss-600/30 bg-abyss-950/40'
                } ${message.deleting ? 'pointer-events-none opacity-40' : ''}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p
                    className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                      message.role === 'user' ? 'text-abyss-200/70' : 'text-abyss-300/70'
                    }`}
                  >
                    {message.role === 'user' ? 'You' : 'Rules Helper'}
                  </p>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-75 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => copyMessage(message.content, idx)}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-abyss-700/50 hover:text-pearl"
                      title="Copy message"
                      aria-label="Copy message"
                    >
                      {copiedIndex === idx ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteMessage(idx)}
                      disabled={message.deleting}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-coral-900/30 hover:text-coral-300 disabled:opacity-40"
                      title="Delete message"
                      aria-label="Delete message"
                    >
                      {message.deleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                {message.role === 'user' ? (
                  <p
                    className={`whitespace-pre-wrap break-words leading-relaxed text-pearl/90 ${fontFamilyClass}`}
                    style={{ fontSize: fontPx }}
                  >
                    {message.content}
                  </p>
                ) : (
                  <>
                    <div className={`min-w-0 break-words ${fontFamilyClass}`} style={{ fontSize: fontPx }}>
                      <AssistantMarkdown content={message.content} />
                    </div>
                    {(message.characterNames?.length ?? 0) > 0 ? (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-foam-400/30 bg-foam-900/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-foam-200">
                        <Users className="h-3 w-3" />
                        Character: {message.characterNames!.join(', ')}
                      </span>
                    ) : (
                      message.usedCharacters && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-foam-400/30 bg-foam-900/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-foam-200">
                          <Users className="h-3 w-3" />
                          Your characters
                        </span>
                      )
                    )}
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-abyss-700/30 pt-2">
                        {message.sources.slice(0, 6).map((source, si) => (
                          <span
                            key={si}
                            className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-abyss-500/40 bg-abyss-950/50 px-2 py-0.5 text-[10px] font-medium text-abyss-200"
                            title={`${source.docTitle} • ${source.heading}`}
                          >
                            <Layers className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">
                              {source.docTitle} • {source.heading}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {sending && (
              <div className="rounded-2xl border border-abyss-600/30 bg-abyss-950/40 p-4 sm:p-5">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className={fontFamilyClass} style={{ fontSize: fontPx }}>
                    Looking through the rules...
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* PINNED BOTTOM COMPOSER */}
      <div className="shrink-0 border-t border-abyss-700/35 bg-abyss-950/90 px-3 py-2 backdrop-blur-xl sm:px-5 sm:py-3 lg:bg-abyss-950/40 lg:backdrop-blur-none">
        {error && (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-coral-500/30 bg-coral-900/20 px-3 py-2 text-xs text-coral-200 sm:text-sm">
            <X className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {error}
              {/key/i.test(error) ? ' You can add or switch keys in AI Configuration.' : ''}
            </span>
          </div>
        )}

        {showQuickPrompts && (
          <div className="mb-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto overscroll-contain">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setInput(prompt);
                  setShowQuickPrompts(false);
                  window.setTimeout(() => {
                    autoGrowInput();
                    inputRef.current?.focus();
                  }, 0);
                }}
                className="rounded-full border border-abyss-500/35 bg-abyss-900/50 px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:text-pearl"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <div className="relative min-w-0">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrowInput();
            }}
            onKeyDown={(e) => handleChatKeyDown(e, handleSend)}
            placeholder="Ask about the rules, your characters, or building Extras..."
            rows={1}
            className="min-h-11 max-h-28 w-full resize-none overflow-y-auto rounded-xl border border-abyss-600/40 bg-abyss-900/70 py-2.5 pl-3.5 pr-12 text-sm leading-relaxed text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
          />
          <button
            type="button"
            onClick={sending ? () => abortControllerRef.current?.abort() : handleSend}
            disabled={!sending && !input.trim()}
            className="absolute bottom-2 right-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-pearl/75 transition-colors hover:bg-abyss-700/50 hover:text-pearl disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={sending ? 'Stop response' : 'Send message'}
            title={sending ? 'Stop generating' : 'Send (Enter)'}
          >
            {sending ? <Square className="h-[18px] w-[18px] fill-current" /> : <Send className="h-[18px] w-[18px]" />}
          </button>
        </div>
        <p className="mt-1.5 hidden text-center text-[11px] text-muted/70 sm:block">
          Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </section>
  );
}