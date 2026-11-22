import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ClipboardList,
  Copy,
  Eraser,
  Files,
  Loader2,
  MessageSquare,
  ScanLine,
  Send,
  Terminal,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import MarkdownChat from '@/components/devMode/MarkdownChat';
import RulePane from '@/components/devMode/RulePane';
import {
  estimateTokens,
  nextCartridgeVersion,
  scanFiles,
  type CartridgeSnapshot,
  type DevFile,
} from '@/components/devMode/versionScanner';

type StudioTab = 'viewer' | 'scanner' | 'chat';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const BASELINE_KEY = 'dev_mode_rule_baseline_v1';
const MAX_CHAT_FILES_BYTES = 900000;

function loadBaseline(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BASELINE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export default function DevModeStudio() {
  const { user, isAdmin } = useAuth();

  const [studioTab, setStudioTab] = useState<StudioTab>('viewer');
  const [files, setFiles] = useState<DevFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [paneLeftId, setPaneLeftId] = useState<string | null>(null);
  const [paneRightId, setPaneRightId] = useState<string | null>(null);

  const [attachedIds, setAttachedIds] = useState<Set<string>>(new Set());
  const [cartridge, setCartridge] = useState<CartridgeSnapshot | null>(null);
  const [baseline, setBaseline] = useState<Record<string, string>>(() => loadBaseline());

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activeModelLabel, setActiveModelLabel] = useState<string>('');

  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---- Data loading ----
  useEffect(() => {
    if (!user) {
      setFiles([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    Promise.all([
      supabase
        .from('rule_documents')
        .select('id, slug, title, content, updated_at')
        .order('title', { ascending: true }),
      supabase
        .from('user_custom_apexes')
        .select('id, title, content, created_at')
        .order('created_at', { ascending: true }),
      supabase
        .from('store_cartridges')
        .select('version, payload, uploaded_at')
        .eq('is_active', true)
        .order('uploaded_at', { ascending: false })
        .limit(1),
    ]).then(([rulesRes, apexesRes, cartridgeRes]) => {
      if (cancelled) return;
      if (rulesRes.error || apexesRes.error) {
        console.error('Dev Mode load error', rulesRes.error ?? apexesRes.error);
        setLoadError('Dev Mode could not load your rule files. Please refresh to try again.');
      } else {
        const loaded: DevFile[] = [];
        for (const row of rulesRes.data ?? []) {
          loaded.push({
            id: `rule-${row.slug}`,
            kind: 'rule',
            dbId: row.id,
            slug: row.slug,
            title: row.title,
            category: 'Rule document',
            content: row.content ?? '',
            updatedAt: row.updated_at,
          });
        }
        for (const row of apexesRes.data ?? []) {
          loaded.push({
            id: `apex-${row.id}`,
            kind: 'apex',
            dbId: row.id,
            slug: row.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            title: row.title,
            category: 'Custom apex',
            content: row.content ?? '',
            updatedAt: row.created_at,
          });
        }
        setFiles(loaded);
        setPaneLeftId((prev) => prev ?? loaded[0]?.id ?? null);
        setPaneRightId((prev) => prev ?? loaded[1]?.id ?? null);
      }

      if (!cartridgeRes.error) {
        const row = (cartridgeRes.data ?? [])[0];
        if (row) {
          const contents: Record<string, string> = {};
          const rules = (row.payload as { rules?: Array<{ slug: string; content: string }> })?.rules ?? [];
          for (const rule of rules) {
            contents[rule.slug] = rule.content ?? '';
          }
          setCartridge({
            version: row.version,
            uploadedAt: row.uploaded_at,
            contents,
          });
        }
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Active AI key + bound model preference label for the context bar
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
        setActiveModelLabel(modelPref || data.label || data.provider || 'Active key');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages, chatSending]);

  const attachedFiles = useMemo(() => files.filter((f) => attachedIds.has(f.id)), [files, attachedIds]);
  const attachedTokens = useMemo(
    () => estimateTokens(attachedFiles.map((f) => f.content).join('\n')),
    [attachedFiles],
  );
  const leftFile = files.find((f) => f.id === paneLeftId) ?? null;
  const rightFile = files.find((f) => f.id === paneRightId) ?? null;

  const coreRuleFiles = useMemo(() => files.filter((f) => f.kind === 'rule'), [files]);
  const scanRows = useMemo(() => scanFiles(files, cartridge, baseline), [files, cartridge, baseline]);
  const recommendedCartridgeVersion = useMemo(
    () => nextCartridgeVersion(cartridge, files),
    [cartridge, files],
  );

  if (!isAdmin || !user) return null;

  const toggleAttached = (id: string) => {
    setAttachedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllCore = () => {
    setAttachedIds((prev) => {
      const next = new Set(prev);
      for (const f of coreRuleFiles) next.add(f.id);
      return next;
    });
  };

  const clearAll = () => setAttachedIds(new Set());

  const handleSaveRuleContent = (dbId: string, kind: 'rule' | 'apex', content: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.dbId === dbId && f.kind === kind ? { ...f, content, updatedAt: new Date().toISOString() } : f)),
    );
  };

  const sendChat = useCallback(
    async (history: ChatMessage[], rawInput: string) => {
      setChatSending(true);
      setChatError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('Your session expired. Sign in again and retry.');

        let chosenModel: string | undefined;
        const { data: activeKeyRow } = await supabase
          .from('user_ai_keys_safe')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();
        if (activeKeyRow?.id) {
          chosenModel = localStorage.getItem(`model_pref_${activeKeyRow.id}`) ?? undefined;
        }

        let payloadBytes = 0;
        const attachedPayload = attachedFiles
          .map((f) => ({ title: f.title, slug: f.slug, versionTag: '', source: f.kind, content: f.content }))
          .filter((f) => {
            payloadBytes += f.content.length;
            return payloadBytes <= MAX_CHAT_FILES_BYTES;
          });

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/narrate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            mode: 'dev_assistant',
            messages: history,
            attachedFiles: attachedPayload,
            aiModel: chosenModel,
          }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || `The Dev Assistant could not respond (${response.status}).`);
        }
        if (!data?.reply) {
          throw new Error('The Dev Assistant returned an empty response. Try again.');
        }
        setChatMessages([...history, { role: 'assistant', content: data.reply }]);
      } catch (err) {
        setChatError(err instanceof Error ? err.message : 'The Dev Assistant could not respond. Please try again.');
      } finally {
        setChatSending(false);
      }
    },
    [attachedFiles, user],
  );

  const handleSend = () => {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    const nextHistory = [...chatMessages, { role: 'user' as const, content: text }];
    setChatMessages(nextHistory);
    setChatInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    void sendChat(nextHistory, text);
  };

  const clearChat = () => {
    setChatMessages([]);
    setChatError(null);
    setChatInput('');
  };

  const copyMessage = (content: string, idx: number) => {
    void navigator.clipboard.writeText(content);
    setCopiedIndex(idx);
    window.setTimeout(() => setCopiedIndex(null), 1800);
  };

  const sendVersionAudit = () => {
    const modified = scanRows.filter((r) => r.status !== 'unchanged');
    const auditPrompt = [
      'Please audit my rule files for the next cartridge export. Modified or new files:',
      ...modified.map(
        (r) =>
          `- ${r.file.title} (${r.file.slug}): detected v${r.versionTag || 'Untagged'}, status ${
            r.status === 'modified' ? 'Modified since last cartridge' : 'New / Not in cartridge'
          }`,
      ),
      modified.length === 0
        ? 'No files have changed since the last cartridge — please review the attached rules anyway for conflicts.'
        : 'Review each modified file, flag conflicts or redundancies, and confirm the recommended version bumps.',
    ].join('\n');
    setStudioTab('chat');
    setChatInput(auditPrompt);
    inputRef.current?.focus();
  };

  const autoGrowInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  const starterChats = [
    'Audit attached rules for conflicts',
    'Review Bond & XP balance',
    'Tighten wording & flag redundant rules',
    'Brainstorm lore & encounter hooks',
  ];

  const studioTabBtn = (tab: StudioTab, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setStudioTab(tab)}
      className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-all sm:text-sm ${
        studioTab === tab
          ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
          : 'text-muted hover:bg-abyss-800/40 hover:text-pearl'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <section className="space-y-4">
      <div className="glass-panel rounded-2xl border-amber-400/25 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
            <Terminal className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-semibold text-pearl">Dev Mode Studio</h2>
            <p className="text-xs text-amber-200/75">
              Admin-only workspace — completely hidden from regular players.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl bg-abyss-950/40 p-1">
          {studioTabBtn('viewer', <Files className="h-4 w-4" />, 'Rule Viewer')}
          {studioTabBtn('scanner', <ScanLine className="h-4 w-4" />, 'Version Scanner')}
          {studioTabBtn('chat', <MessageSquare className="h-4 w-4" />, 'Dev Chat')}
        </div>
      </div>

      {loading && (
        <div className="glass-panel flex items-center justify-center gap-2 rounded-2xl p-10 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading your rule files...
        </div>
      )}

      {!loading && loadError && (
        <div className="glass-panel rounded-2xl border-coral-500/30 p-5 text-sm text-coral-300">{loadError}</div>
      )}

      {/* ---------- VIEWER ---------- */}
      {!loading && !loadError && studioTab === 'viewer' && (
        <div className="space-y-3">
          <div className="glass-panel flex flex-wrap items-center gap-2 rounded-2xl p-3">
            <button
              type="button"
              onClick={selectAllCore}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-foam-400/40 bg-foam-900/20 px-3 py-1.5 text-xs font-medium text-foam-200 hover:bg-foam-900/40"
            >
              <Check className="h-3.5 w-3.5" />
              Select All Core
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-abyss-500/35 bg-abyss-800/40 px-3 py-1.5 text-xs font-medium text-muted hover:text-pearl"
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear All
            </button>
            <span className="ml-auto text-xs text-muted">
              <strong className="text-pearl">{attachedFiles.length}</strong> attached · ~
              {attachedTokens.toLocaleString()} tokens
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start xl:gap-6">
            <RulePane
              label="Pane 1"
              file={leftFile}
              files={files}
              attached={leftFile ? attachedIds.has(leftFile.id) : false}
              onAttachToggle={() => leftFile && toggleAttached(leftFile.id)}
              onSelectFile={setPaneLeftId}
              onSaveContent={handleSaveRuleContent}
            />
            <RulePane
              label="Pane 2"
              file={rightFile}
              files={files}
              attached={rightFile ? attachedIds.has(rightFile.id) : false}
              onAttachToggle={() => rightFile && toggleAttached(rightFile.id)}
              onSelectFile={setPaneRightId}
              onSaveContent={handleSaveRuleContent}
            />
          </div>
        </div>
      )}

      {/* ---------- SCANNER ---------- */}
      {!loading && !loadError && studioTab === 'scanner' && (
        <div className="space-y-3">
          <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-abyss-300/70">
                File Version Scanner
              </p>
              <p className="mt-1 text-sm text-muted">
                Latest active cartridge:{' '}
                {cartridge ? (
                  <strong className="text-pearl">{cartridge.version}</strong>
                ) : (
                  'none exported yet'
                )}{' '}
                · Recommended next export: <strong className="text-foam-300">{recommendedCartridgeVersion}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={sendVersionAudit}
              disabled={files.length === 0}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-abyss-500/80 px-4 py-2 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400 disabled:opacity-50"
            >
              <ClipboardList className="h-4 w-4" />
              Send Version Audit to Dev Chat
            </button>
          </div>

          <div className="glass-panel overflow-hidden rounded-2xl">
            {scanRows.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">No rule files to scan yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-abyss-700/30 text-[11px] uppercase tracking-[0.14em] text-abyss-300/70">
                      <th className="px-4 py-3 font-semibold">Document</th>
                      <th className="px-4 py-3 font-semibold">Version</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Recommended bump</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanRows.map((row) => (
                      <tr key={row.file.id} className="border-b border-abyss-800/30 last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium text-pearl">{row.file.title}</p>
                          <p className="text-xs text-muted">{row.file.category}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-pearl">
                          {row.versionTag ? `v${row.versionTag}` : 'Untagged'}
                        </td>
                        <td className="px-4 py-3">
                          {row.status === 'unchanged' ? (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                              Unchanged
                            </span>
                          ) : row.status === 'modified' ? (
                            <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                              Modified since last cartridge
                            </span>
                          ) : (
                            <span className="rounded-full border border-coral-400/30 bg-coral-500/15 px-2 py-0.5 text-[11px] font-semibold text-coral-300">
                              New / Not in cartridge
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-foam-300">{row.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- DEV CHAT ---------- */}
      {!loading && !loadError && studioTab === 'chat' && (
        <div className="glass-panel flex flex-col rounded-2xl p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-abyss-300/70">
              AI Developer Assistant
            </p>
            <button
              type="button"
              onClick={clearChat}
              disabled={chatMessages.length === 0}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-abyss-500/35 bg-abyss-800/40 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-pearl disabled:opacity-40"
            >
              <Eraser className="h-3.5 w-3.5" />
              New Chat / Clear
            </button>
          </div>

          <div ref={feedRef} className="max-h-[62vh] min-h-[20rem] min-w-0 space-y-3 overflow-y-auto pr-1">
            {chatMessages.length === 0 && !chatSending && (
              <div className="rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/30 p-5 text-center">
                <p className="mb-3 text-sm text-muted">
                  Chat freely about rules, lore, balance, and edits. Attach files in the Rule Viewer
                  first so the assistant can read them.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {starterChats.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setChatInput(chip)}
                      className="rounded-full border border-foam-400/30 bg-foam-900/20 px-3 py-1.5 text-xs font-medium text-foam-200 transition-colors hover:bg-foam-900/40"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.map((message, idx) => (
              <div
                key={idx}
                className={`group relative min-w-0 rounded-2xl border p-4 sm:p-5 ${
                  message.role === 'user'
                    ? 'border-abyss-400/30 bg-abyss-600/20'
                    : 'border-abyss-600/30 bg-abyss-950/40'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p
                    className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                      message.role === 'user' ? 'text-abyss-200/70' : 'text-amber-200/70'
                    }`}
                  >
                    {message.role === 'user' ? 'You' : 'Dev Assistant'}
                  </p>
                  <button
                    type="button"
                    onClick={() => copyMessage(message.content, idx)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-abyss-700/50 hover:text-pearl focus-visible:opacity-100 group-hover:opacity-100"
                    title="Copy message"
                    aria-label="Copy message"
                  >
                    {copiedIndex === idx ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                {message.role === 'user' ? (
                  <p className="whitespace-pre-wrap break-words leading-relaxed text-pearl/90">{message.content}</p>
                ) : (
                  <div className="min-w-0">
                    <MarkdownChat content={message.content} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {chatError && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-coral-500/30 bg-coral-900/20 px-3.5 py-2.5 text-sm text-coral-200">
              <X className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{chatError}</span>
            </div>
          )}

          {chatSending && (
            <div className="rounded-2xl border border-abyss-600/30 bg-abyss-950/40 p-4 sm:p-5">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                The Dev Assistant is thinking...
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-abyss-700/30 bg-abyss-950/40 px-3 py-2 text-[11px] text-muted">
            <span>
              <strong className="text-pearl">{attachedFiles.length}</strong> file
              {attachedFiles.length === 1 ? '' : 's'} attached · ~{attachedTokens.toLocaleString()} tokens
            </span>
            <button
              type="button"
              onClick={() => setStudioTab('viewer')}
              className="rounded-full border border-abyss-500/40 px-2 py-0.5 font-medium text-abyss-200 transition-colors hover:text-pearl"
            >
              Toggle attached files
            </button>
            {activeModelLabel && <span className="ml-auto truncate">Responding with: {activeModelLabel}</span>}
          </div>

          <div className="mt-2 min-w-0">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  autoGrowInput();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask the Dev Assistant anything — Enter to send, Shift+Enter for a new line"
                rows={1}
                className="min-h-12 max-h-44 w-full resize-none overflow-y-auto rounded-xl border border-abyss-600/40 bg-abyss-900/60 py-3 pl-4 pr-14 text-sm leading-relaxed text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={chatSending || !chatInput.trim()}
                className="absolute bottom-2.5 right-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-pearl/70 transition-colors hover:bg-abyss-700/40 hover:text-pearl disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
                title="Send (Enter)"
              >
                {chatSending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
