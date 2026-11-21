import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, Eraser, Layers, Loader2, LockKeyhole, Send, Users, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

interface SourceChip {
  docTitle: string;
  heading: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceChip[];
  usedCharacters?: boolean;
}

const SESSION_KEY = 'rules_helper_chat_session_v1';
const MAX_HISTORY = 10;

const STARTER_CHIPS = [
  'How do I get started?',
  'Explain Stamina, Dice & Daily Saves',
  'Look up my saved characters',
  'Help me build an Extra',
  'Give me a blank Custom Apex template',
];

const QUICK_PROMPTS = [
  'How does the Bond system work?',
  'What happens when I sleep?',
  'How do encounter rolls work?',
  'Explain Legacy Marks',
  'Draft a homebrew item for my grotto',
  'How do waystations and travel work?',
];

interface SessionPayload {
  messages: ChatMessage[];
}

function loadSession(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SessionPayload;
    return Array.isArray(parsed.messages) ? parsed.messages.slice(-40) : [];
  } catch {
    return [];
  }
}

function saveSession(messages: ChatMessage[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ messages: messages.slice(-40) } satisfies SessionPayload));
  } catch {
    // Session-only storage — ignore quota failures silently.
  }
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

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadSession());
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeCharacters, setIncludeCharacters] = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [modelLabel, setModelLabel] = useState('');

  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    saveSession(messages);
  }, [messages]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('user_ai_keys_safe')
      .select('id, provider, label')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const modelPref = localStorage.getItem(`model_pref_${data.id}`);
        setModelLabel(modelPref || data.label || data.provider || '');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const clearChat = () => {
    setMessages([]);
    setError(null);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const sendMessage = useCallback(
    async (history: ChatMessage[], rawMessage: string, charsIncluded: boolean) => {
      setSending(true);
      setError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('Your session expired. Sign in again and try again.');

        let aiModel: string | undefined;
        const { data: activeKeyRow } = await supabase
          .from('user_ai_keys_safe')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();
        if (activeKeyRow?.id) {
          aiModel = localStorage.getItem(`model_pref_${activeKeyRow.id}`) ?? undefined;
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
            includeCharacters: charsIncluded,
            requestType,
            aiModel,
          }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || `The Rules Helper could not respond (${response.status}).`);
        }
        if (!data?.reply) {
          throw new Error('The Rules Helper returned an empty response. Try again.');
        }
        setMessages([
          ...history,
          {
            role: 'assistant',
            content: data.reply,
            sources: Array.isArray(data.sources) ? data.sources : [],
            usedCharacters: Boolean(data.usedCharacters),
          },
        ]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'The Rules Helper could not respond. If you have no active AI key, add one in AI Configuration first.',
        );
      } finally {
        setSending(false);
      }
    },
    [user],
  );

  const handleSend = () => {
    const text = input.trim();
    if (!text || sending) return;
    const nextHistory = [...messages, { role: 'user' as const, content: text }];
    setMessages(nextHistory);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    void sendMessage(nextHistory, text, includeCharacters);
  };

  const handleChip = (chip: string) => {
    if (sending) return;
    const nextHistory = [...messages, { role: 'user' as const, content: chip }];
    setMessages(nextHistory);
    void sendMessage(nextHistory, chip, includeCharacters);
  };

  const autoGrowInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  if (!user) {
    return (
      <section className="glass-panel mx-auto max-w-3xl rounded-2xl p-5 sm:p-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-abyss-700/40 text-foam-300">
            <BookOpenCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold text-pearl">Ask the Rules Helper</h2>
            <p className="text-xs text-muted">
              Uses your active AI key • Looks up rules on demand • Remembers last 10 messages
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
    );
  }

  return (
    <section className="glass-panel mx-auto flex max-w-3xl flex-col rounded-2xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-abyss-700/40 text-foam-300">
            <BookOpenCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-semibold text-pearl">Ask the Rules Helper</h2>
            <p className="truncate text-xs text-muted">
              Uses your active AI key • Looks up rules on demand • Remembers last 10 messages
              {modelLabel ? ` • ${modelLabel}` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={clearChat}
          disabled={messages.length === 0}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-abyss-500/35 bg-abyss-800/40 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-pearl disabled:opacity-40"
        >
          <Eraser className="h-3.5 w-3.5" />
          Clear Chat
        </button>
      </div>

      <div ref={feedRef} className="max-h-[58vh] min-h-[16rem] space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && !sending && (
          <div className="rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/30 p-5 text-center">
            <p className="mb-3 text-sm text-muted">
              Ask anything about the rules — answers cite the exact rule section they came from.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTER_CHIPS.map((chip) => (
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
          <div key={idx} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                message.role === 'user'
                  ? 'rounded-br-md bg-abyss-500/30 text-pearl ring-1 ring-abyss-400/30'
                  : 'rounded-bl-md bg-abyss-900/60 text-muted ring-1 ring-abyss-600/40'
              }`}
            >
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
              ) : (
                <>
                  <AssistantMarkdown content={message.content} />
                  {message.usedCharacters && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-foam-400/30 bg-foam-900/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-foam-200">
                      <Users className="h-3 w-3" />
                      Your characters
                    </span>
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
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-abyss-900/60 px-4 py-3 text-sm text-muted ring-1 ring-abyss-600/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              Looking through the rules...
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-coral-500/30 bg-coral-900/20 px-3.5 py-2.5 text-sm text-coral-200">
          <X className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {error}
            {/key/i.test(error) ? ' You can add or switch keys in AI Configuration.' : ''}
          </span>
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowQuickPrompts((v) => !v)}
          className="text-xs font-medium text-foam-300/80 transition-colors hover:text-foam-200"
        >
          {showQuickPrompts ? '− Hide quick prompts' : '+ Quick prompts'}
        </button>
        {showQuickPrompts && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setInput(prompt)}
                className="rounded-full border border-abyss-500/35 bg-abyss-900/40 px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:text-pearl"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="mt-2 inline-flex w-fit cursor-pointer items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={includeCharacters}
          onChange={(e) => setIncludeCharacters(e.target.checked)}
          className="h-4 w-4 accent-foam-400"
        />
        Include My Characters
      </label>

      <div className="mt-2 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            autoGrowInput();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask about the rules, your characters, or building Extras..."
          rows={1}
          className="max-h-40 min-h-11 w-full flex-1 resize-none rounded-xl border border-abyss-600/40 bg-abyss-950/60 px-3.5 py-2.5 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-abyss-500/80 text-pearl transition-colors hover:bg-abyss-400 disabled:opacity-50"
          aria-label="Send message"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </section>
  );
}
