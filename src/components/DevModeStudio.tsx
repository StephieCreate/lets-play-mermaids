import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  Edit3,
  Eraser,
  Eye,
  Files,
  Loader2,
  MessageSquare,
  Save,
  ScanLine,
  Search,
  Send,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useFontSettings } from '@/context/FontSettingsContext';
import { supabase } from '@/lib/supabase';
import { handleChatKeyDown } from '@/lib/deviceInput';
import MarkdownChat from '@/components/devMode/MarkdownChat';
import {
  estimateTokens,
  nextCartridgeVersion,
  scanFiles,
  type CartridgeSnapshot,
  type DevFile,
} from '@/components/devMode/versionScanner';

type StudioTab = 'tools' | 'scanner' | 'chat';

interface ChatMessage {
  id: string | null;
  role: 'user' | 'assistant';
  content: string;
  deleting?: boolean;
}

interface SavedChatRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface MarkdownSection {
  index: number;
  heading: string;
  start: number;
  end: number;
  text: string;
}

interface SectionSearchHit {
  key: string;
  file: DevFile;
  section: MarkdownSection;
  matchCount: number;
  snippet: string;
}

interface SavedSectionBanner {
  fileId: string;
  title: string;
  heading: string;
  fullContent: string;
}

const BASELINE_KEY = 'dev_mode_rule_baseline_v1';
const MAX_CHAT_FILES_BYTES = 8_000_000;
const MAX_SAVED_MESSAGES = 200;

const CORE_SLUGS = new Set([
  'universal-core-engine',
  'universal-game-templates',
  'medicinal-algae-quick-reference',
  'lets-play-mermaids-world-lore',
]);

async function fetchSavedMessages(userId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('assistant_chat_messages')
    .select('id, role, content')
    .eq('user_id', userId)
    .eq('chat_type', 'dev_assistant')
    .order('created_at', { ascending: true })
    .limit(MAX_SAVED_MESSAGES);
  if (error) {
    console.error('Could not load saved dev chat', error);
    return [];
  }
  return ((data ?? []) as SavedChatRow[]).map((row) => ({ id: row.id, role: row.role, content: row.content }));
}

async function insertChatMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('assistant_chat_messages')
    .insert({ user_id: userId, chat_type: 'dev_assistant', role, content })
    .select('id')
    .single();
  if (error || !data) {
    console.error('Could not save dev chat message', error);
    return null;
  }
  return (data as { id: string }).id;
}

async function deleteChatMessage(rowId: string): Promise<boolean> {
  const { error } = await supabase
    .from('assistant_chat_messages')
    .delete()
    .eq('id', rowId)
    .eq('chat_type', 'dev_assistant');
  if (error) {
    console.error('Could not delete dev chat message', error);
    return false;
  }
  return true;
}

async function clearChatMessages(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('assistant_chat_messages')
    .delete()
    .eq('user_id', userId)
    .eq('chat_type', 'dev_assistant');
  if (error) {
    console.error('Could not clear dev chat', error);
    return false;
  }
  return true;
}

function loadBaseline(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BASELINE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

// Splits a markdown document into exact-offset sections by headings (ignoring # inside code fences)
function parseMarkdownSections(content: string): MarkdownSection[] {
  if (!content) return [];
  const sections: MarkdownSection[] = [];
  const lineRegex = /[^\n]*\n|[^\n]+$/g;
  let inCodeFence = false;
  let currentStart = 0;
  let currentHeading = 'Document Header / Intro';
  let hasStarted = false;
  let match: RegExpExecArray | null;

  while ((match = lineRegex.exec(content)) !== null) {
    const rawLine = match[0];
    const lineStart = match.index;
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
    }

    const headingMatch = !inCodeFence ? rawLine.match(/^(#{1,6})\s+(.+?)\r?\n?$/) : null;

    if (headingMatch) {
      if (hasStarted && lineStart > currentStart) {
        sections.push({
          index: sections.length,
          heading: currentHeading,
          start: currentStart,
          end: lineStart,
          text: content.slice(currentStart, lineStart),
        });
      }
      currentStart = lineStart;
      currentHeading = headingMatch[2].trim();
      hasStarted = true;
    } else if (!hasStarted) {
      hasStarted = true;
    }
  }

  if (hasStarted && currentStart < content.length) {
    sections.push({
      index: sections.length,
      heading: currentHeading,
      start: currentStart,
      end: content.length,
      text: content.slice(currentStart),
    });
  }

  return sections;
}

function buildSnippet(text: string, queryLower: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(queryLower);
  if (idx === -1) return text.slice(0, 140).replace(/\s+/g, ' ').trim();
  const start = Math.max(0, idx - 55);
  const end = Math.min(text.length, idx + queryLower.length + 105);
  const slice = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${slice}${end < text.length ? '…' : ''}`;
}

export default function DevModeStudio() {
  const { user, isAdmin } = useAuth();
  const { fontFamilyClass, fontPx } = useFontSettings();

  const [studioTab, setStudioTab] = useState<StudioTab>('tools');
  const [files, setFiles] = useState<DevFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Rule attachment checklist (all groups always start collapsed)
  const [attachedIds, setAttachedIds] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [peekFile, setPeekFile] = useState<DevFile | null>(null);
  const [peekCopied, setPeekCopied] = useState(false);

  // Cross-file search + inline Markdown section patcher
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAttachedOnly, setSearchAttachedOnly] = useState(false);
  const [editingHitKey, setEditingHitKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingSection, setSavingSection] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [copiedHitKey, setCopiedHitKey] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<SavedSectionBanner | null>(null);
  const [copiedBanner, setCopiedBanner] = useState(false);

  // Version scanner state
  const [cartridge, setCartridge] = useState<CartridgeSnapshot | null>(null);
  const [baseline] = useState<Record<string, string>>(() => loadBaseline());

  // Dev Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activeModelLabel, setActiveModelLabel] = useState<string>('');

  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevChatCountRef = useRef(0);
  const userId = user?.id ?? null;

  // ---- Data loading ----
  useEffect(() => {
    if (!userId) {
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
  }, [userId]);

  // Active AI key + bound model preference label for the context bar
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
        const modelPref = localStorage.getItem(`model_pref_${data.id}`);
        setActiveModelLabel(modelPref || data.label || data.provider || 'Active key');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setChatMessages([]);
      setChatHistoryLoading(false);
      return;
    }
    let cancelled = false;
    setChatHistoryLoading(true);
    fetchSavedMessages(userId).then((saved) => {
      if (!cancelled) setChatMessages(saved);
      setChatHistoryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Scroll only the inner chat container, and only when a new message is added.
  useEffect(() => {
    if (chatMessages.length > prevChatCountRef.current && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
    prevChatCountRef.current = chatMessages.length;
  }, [chatMessages]);

  // Jump to the newest message whenever the Dev Chat tab is opened.
  useEffect(() => {
    if (studioTab === 'chat' && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [studioTab, chatHistoryLoading]);

  const attachedFiles = useMemo(() => files.filter((f) => attachedIds.has(f.id)), [files, attachedIds]);
  const attachedTokens = useMemo(
    () => estimateTokens(attachedFiles.map((f) => f.content).join('\n')),
    [attachedFiles],
  );
  const attachedChars = useMemo(
    () => attachedFiles.reduce((sum, f) => sum + f.content.length, 0),
    [attachedFiles],
  );

  // Organized rule groups for the always-collapsed checklist
  const fileGroups = useMemo(() => {
    const core: DevFile[] = [];
    const apex: DevFile[] = [];
    const triad: DevFile[] = [];
    const npc: DevFile[] = [];
    const customApex: DevFile[] = [];
    const other: DevFile[] = [];

    for (const file of files) {
      if (file.kind === 'apex') {
        customApex.push(file);
      } else if (CORE_SLUGS.has(file.slug)) {
        core.push(file);
      } else if (file.slug.startsWith('apex-')) {
        apex.push(file);
      } else if (file.slug.startsWith('triad-')) {
        triad.push(file);
      } else if (file.slug.startsWith('npc-')) {
        npc.push(file);
      } else {
        other.push(file);
      }
    }

    return [
      { key: 'core', label: 'Core Rules', items: core },
      { key: 'apex', label: 'Apex Plugins', items: apex },
      { key: 'triad', label: 'Triad Rules', items: triad },
      { key: 'npc', label: 'NPCs', items: npc },
      { key: 'custom-apex', label: 'Custom Apexes', items: customApex },
      { key: 'other', label: 'Other Rules', items: other },
    ].filter((g) => g.items.length > 0);
  }, [files]);

  const coreFiles = useMemo(
    () => files.filter((f) => f.kind === 'rule' && CORE_SLUGS.has(f.slug)),
    [files],
  );

  // Cross-file Markdown section search
  const searchHits = useMemo<SectionSearchHit[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];

    const pool = searchAttachedOnly ? attachedFiles : files;
    const hits: SectionSearchHit[] = [];

    for (const file of pool) {
      if (!file.content) continue;
      const sections = parseMarkdownSections(file.content);
      for (const section of sections) {
        const lower = section.text.toLowerCase();
        let count = 0;
        let pos = lower.indexOf(q);
        while (pos !== -1) {
          count += 1;
          pos = lower.indexOf(q, pos + q.length);
        }
        if (count > 0) {
          hits.push({
            key: `${file.id}::${section.index}`,
            file,
            section,
            matchCount: count,
            snippet: buildSnippet(section.text, q),
          });
        }
      }
    }

    return hits;
  }, [searchQuery, searchAttachedOnly, attachedFiles, files]);

  const scanRows = useMemo(() => scanFiles(files, cartridge, baseline), [files, cartridge, baseline]);
  const recommendedCartridgeVersion = useMemo(
    () => nextCartridgeVersion(cartridge, files),
    [cartridge, files],
  );

  const sendChat = useCallback(
    async (history: ChatMessage[]): Promise<boolean> => {
      if (!user) return false;
      setChatSending(true);
      setChatError(null);
      const controller = new AbortController();
      abortControllerRef.current = controller;
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
          signal: controller.signal,
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || `The Dev Assistant could not respond (${response.status}).`);
        }
        if (!data?.reply) {
          throw new Error('The Dev Assistant returned an empty response. Try again.');
        }
        const savedId = await insertChatMessage(user.id, 'assistant', data.reply);
        setChatMessages([...history, { id: savedId, role: 'assistant', content: data.reply }]);
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return true;
        }
        setChatError(err instanceof Error ? err.message : 'The Dev Assistant could not respond. Please try again.');
      } finally {
        setChatSending(false);
        abortControllerRef.current = null;
      }
      return false;
    },
    [attachedFiles, user],
  );

  if (!isAdmin || !user) return null;

  const autoGrowInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  };

  const toggleAttached = (id: string) => {
    setAttachedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroupSelection = (items: DevFile[]) => {
    setAttachedIds((prev) => {
      const next = new Set(prev);
      const allSelected = items.every((item) => next.has(item.id));
      for (const item of items) {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  };

  const selectCoreOnly = () => {
    setAttachedIds(new Set(coreFiles.map((f) => f.id)));
  };

  const selectAllRules = () => {
    setAttachedIds(new Set(files.filter((f) => f.kind === 'rule').map((f) => f.id)));
  };

  const clearAll = () => setAttachedIds(new Set());

  const startPatchSection = (hit: SectionSearchHit) => {
    setEditingHitKey(hit.key);
    setEditDraft(hit.section.text);
    setSectionError(null);
  };

  const cancelPatchSection = () => {
    setEditingHitKey(null);
    setEditDraft('');
    setSectionError(null);
  };

  const handleSaveSection = async (hit: SectionSearchHit) => {
    setSavingSection(true);
    setSectionError(null);

    const { file, section } = hit;
    let replacement = editDraft;
    // Keep the next heading on its own line if another section follows
    if (section.end < file.content.length && replacement.length > 0 && !replacement.endsWith('\n')) {
      replacement += '\n';
    }

    const updatedFullContent =
      file.content.slice(0, section.start) + replacement + file.content.slice(section.end);

    const { error: updateError } =
      file.kind === 'rule'
        ? await supabase
            .from('rule_documents')
            .update({ content: updatedFullContent, updated_at: new Date().toISOString() })
            .eq('id', file.dbId)
        : await supabase
            .from('user_custom_apexes')
            .update({ content: updatedFullContent })
            .eq('id', file.dbId);

    if (updateError) {
      console.error('Could not save patched section', updateError);
      setSectionError('Could not save that section. Please try again.');
      setSavingSection(false);
      return;
    }

    const nowIso = new Date().toISOString();
    setFiles((prev) =>
      prev.map((f) =>
        f.id === file.id ? { ...f, content: updatedFullContent, updatedAt: nowIso } : f,
      ),
    );
    setEditingHitKey(null);
    setEditDraft('');
    setSavedBanner({
      fileId: file.id,
      title: file.title,
      heading: section.heading,
      fullContent: updatedFullContent,
    });
    setCopiedBanner(false);
    setSavingSection(false);
  };

  const copySectionText = (hit: SectionSearchHit) => {
    void navigator.clipboard.writeText(hit.section.text);
    setCopiedHitKey(hit.key);
    window.setTimeout(() => setCopiedHitKey(null), 1800);
  };

  const handleSend = () => {
    const text = chatInput.trim();
    if (!text || chatSending || !user) return;
    const optimistic: ChatMessage = { id: null, role: 'user', content: text };
    const nextHistory = [...chatMessages, optimistic];
    setChatMessages(nextHistory);
    setChatInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    void (async () => {
      const savedId = await insertChatMessage(user.id, 'user', text);
      if (savedId) {
        setChatMessages((prev) => prev.map((m) => (m === optimistic ? { ...m, id: savedId } : m)));
      }
      const aborted = await sendChat(nextHistory);
      if (aborted) {
        setChatInput(text);
        if (inputRef.current) inputRef.current.style.height = 'auto';
        setChatMessages((prev) => {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].role === 'user' && prev[i].content === text) {
              const next = prev.slice();
              next.splice(i, 1);
              return next;
            }
          }
          return prev;
        });
        if (savedId) await deleteChatMessage(savedId);
        window.setTimeout(() => autoGrowInput(), 0);
      }
    })();
  };

  const clearChat = async () => {
    if (!user) return;
    setChatMessages([]);
    setConfirmClear(false);
    setChatError(null);
    setChatInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    await clearChatMessages(user.id);
  };

  const deleteMessage = async (idx: number) => {
    const target = chatMessages[idx];
    if (!target?.id) {
      setChatMessages((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    setChatMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, deleting: true } : m)));
    const ok = await deleteChatMessage(target.id);
    if (ok) {
      setChatMessages((prev) => prev.filter((_, i) => i !== idx));
    } else {
      setChatMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, deleting: false } : m)));
      setChatError('That message could not be deleted. Please try again.');
    }
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
    window.setTimeout(() => {
      autoGrowInput();
      inputRef.current?.focus();
    }, 0);
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
      className={`inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-semibold leading-tight transition-all sm:min-h-10 sm:gap-2 sm:px-3 sm:text-sm ${
        studioTab === tab
          ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
          : 'text-muted hover:bg-abyss-800/40 hover:text-pearl'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <section className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      {/* PINNED COMPACT DEV MODE HEADER & SUB-TABS */}
      <div className="shrink-0 border-b border-amber-400/20 bg-abyss-950/85 px-3 py-2 backdrop-blur-xl sm:px-5 sm:py-3 lg:mb-3 lg:rounded-2xl lg:border lg:glass-panel">
        <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 sm:flex">
              <Terminal className="h-5 w-5"/>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:block">
              <h2 className="shrink-0 font-display text-base font-semibold leading-tight text-pearl sm:text-xl">
                Dev Mode Studio
              </h2>
              <p className="truncate text-[11px] leading-snug text-amber-200/75 sm:text-xs">
                Admin-only workspace — hidden from regular players.
              </p>
            </div>
          </div>

          {studioTab === 'chat' &&
            (confirmClear ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-xs text-coral-300">Clear?</span>
                <button
                  type="button"
                  onClick={clearChat}
                  className="rounded-lg bg-coral-500/25 px-2 py-1 text-xs font-semibold text-coral-200 transition-colors hover:bg-coral-500/40"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-lg border border-abyss-400/30 px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-pearl"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                disabled={chatMessages.length === 0}
                className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-abyss-500/35 bg-abyss-800/40 px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:text-pearl disabled:opacity-40 sm:min-h-9 sm:px-3"
                title="Clear Dev Chat"
              >
                <Eraser className="h-3.5 w-3.5"/>
                <span>Clear</span>
              </button>
            ))}
        </div>

        <div className="flex items-center gap-1.5 rounded-xl bg-abyss-950/50 p-1">
          {studioTabBtn('tools', <Files className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4"/>, 'Rule Tools')}
          {studioTabBtn('scanner', <ScanLine className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4"/>, 'Version Scanner')}
          {studioTabBtn('chat', <MessageSquare className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4"/>, 'Dev Chat')}
        </div>
      </div>

      {loading && (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <div className="glass-panel flex items-center justify-center gap-2 rounded-2xl px-8 py-6 text-sm text-muted">
            <Loader2 className="h-5 w-5 animate-spin"/>
            Loading your rule files...
          </div>
        </div>
      )}

      {!loading && loadError && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 lg:p-0">
          <div className="glass-panel rounded-2xl border-coral-500/30 p-5 text-sm text-coral-300">{loadError}</div>
        </div>
      )}

      {/* ---------- RULE TOOLS: COLLAPSED CHECKLIST + CROSS-FILE SEARCH & SECTION PATCHER ---------- */}
      {!loading && !loadError && studioTab === 'tools' && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4 lg:px-0 lg:py-0">
          {/* 1. DEV CHAT CONTEXT PICKER (ALWAYS-COLLAPSED ACCORDION GROUPS) */}
          <div className="glass-panel rounded-2xl p-3.5 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-abyss-300/75">
                  Dev Chat Context Files
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  <strong className="text-pearl">{attachedFiles.length}</strong> attached ·{' '}
                  {(attachedChars / 1000).toFixed(1)}k chars (full text) · ~
                  {attachedTokens.toLocaleString()} tokens
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStudioTab('chat')}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/25"
              >
                <MessageSquare className="h-3.5 w-3.5"/>
                Open Dev Chat
              </button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={selectCoreOnly}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-foam-400/40 bg-foam-900/20 px-3 py-1.5 text-xs font-medium text-foam-200 transition-colors hover:bg-foam-900/40"
              >
                <Check className="h-3.5 w-3.5"/>
                Select Core ({coreFiles.length})
              </button>
              <button
                type="button"
                onClick={selectAllRules}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-abyss-400/35 bg-abyss-800/45 px-3 py-1.5 text-xs font-medium text-pearl transition-colors hover:bg-abyss-700/50"
              >
                Select All Rules
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={attachedIds.size === 0}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-abyss-500/35 bg-abyss-900/40 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-pearl disabled:opacity-40"
              >
                <Eraser className="h-3.5 w-3.5"/>
                Clear
              </button>
            </div>

            {/* Always-collapsed group accordions */}
            <div className="space-y-1.5">
              {fileGroups.map((group) => {
                const isOpen = Boolean(openGroups[group.key]);
                const selectedInGroup = group.items.filter((item) => attachedIds.has(item.id)).length;
                const allInGroupSelected = selectedInGroup === group.items.length && group.items.length > 0;

                return (
                  <div
                    key={group.key}
                    className="overflow-hidden rounded-xl border border-abyss-700/35 bg-abyss-950/35"
                  >
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))
                        }
                        className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-left"
                        aria-expanded={isOpen}
                      >
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-abyss-300/80 transition-transform duration-200 ${
                          isOpen ? '' : '-rotate-90'
                           }`}
                          />
                        <span className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-pearl">
                          {group.label}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            selectedInGroup > 0
                              ? 'border border-amber-400/35 bg-amber-500/15 text-amber-200'
                              : 'border border-abyss-600/40 bg-abyss-900/60 text-muted'
                          }`}
                        >
                          {selectedInGroup}/{group.items.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleGroupSelection(group.items)}
                        className="shrink-0 rounded-lg border border-abyss-600/40 bg-abyss-900/50 px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:text-pearl"
                      >
                        {allInGroupSelected ? 'Uncheck all' : 'Check all'}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="divide-y divide-abyss-800/40 border-t border-abyss-700/30 px-2 py-1">
                        {group.items.map((file) => {
                          const checked = attachedIds.has(file.id);
                          return (
                            <div
                              key={file.id}
                              className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-abyss-800/30"
                            >
                              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleAttached(file.id)}
                                  className="h-4 w-4 shrink-0 rounded border-abyss-500/60 bg-abyss-950 text-amber-400 focus:ring-amber-400/40"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-pearl">
                                    {file.title}
                                  </span>
                                  <span className="block text-[11px] text-muted">
                                    {(file.content.length / 1000).toFixed(1)}k chars
                                    {file.content.length === 0 ? ' · empty' : ''}
                                  </span>
                                </span>
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  setPeekFile(file);
                                  setPeekCopied(false);
                                }}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-abyss-600/35 bg-abyss-900/50 text-muted transition-colors hover:border-abyss-400/50 hover:text-pearl"
                                title={`Peek ${file.title}`}
                                aria-label={`Peek ${file.title}`}
                              >
                                <Eye className="h-3.5 w-3.5"/>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. SEARCH ACROSS ALL RULES + SECTION PATCHER */}
          <div className="glass-panel rounded-2xl p-3.5 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-abyss-300/75">
                  Find &amp; Patch Sections Across Rules
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Search a mechanic, term, or heading to inspect or patch just that Markdown section.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={searchAttachedOnly}
                  onChange={(e) => setSearchAttachedOnly(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-abyss-500/60 bg-abyss-950 text-amber-400"
                />
                <span>Attached only</span>
              </label>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/70"/>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSectionError(null);
                }}
                placeholder="Search e.g. Fortified Claim, Grotto Safety, Legacy Marks..."
                className="min-h-11 w-full rounded-xl border border-abyss-600/45 bg-abyss-950/70 py-2 pl-9 pr-9 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-amber-400/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    cancelPatchSection();
                  }}
                  className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-pearl"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4"/>
                </button>
              )}
            </div>

            {/* Post-save banner so you can copy the full updated rule back into Google Docs */}
            {savedBanner && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
                <div className="min-w-0">
                  <p className="font-semibold">
                    Saved section in {savedBanner.title}
                  </p>
                  <p className="truncate text-emerald-200/80">{savedBanner.heading}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(savedBanner.fullContent);
                      setCopiedBanner(true);
                      window.setTimeout(() => setCopiedBanner(false), 2000);
                    }}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/30"
                  >
                    {copiedBanner ? <Check className="h-3.5 w-3.5"/> : <Copy className="h-3.5 w-3.5"/>}
                    {copiedBanner ? 'Copied Full Rule!' : 'Copy Full Rule for Docs'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSavedBanner(null)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-emerald-200/70 hover:text-emerald-100"
                    aria-label="Dismiss saved notice"
                  >
                    <X className="h-3.5 w-3.5"/>
                  </button>
                </div>
              </div>
            )}

            {sectionError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-coral-500/30 bg-coral-900/20 px-3 py-2 text-xs text-coral-200">
                <X className="mt-0.5 h-4 w-4 shrink-0"/>
                <span>{sectionError}</span>
              </div>
            )}

            {/* Search results */}
            {searchQuery.trim().length >= 2 && (
              <div className="mt-3 space-y-2.5">
                <p className="text-xs text-muted">
                  {searchHits.length === 0
                    ? `No matching sections found${searchAttachedOnly ? ' in attached files' : ''}.`
                    : `${searchHits.length} matching section${searchHits.length === 1 ? '' : 's'} across ${
                        new Set(searchHits.map((h) => h.file.id)).size
                      } file${new Set(searchHits.map((h) => h.file.id)).size === 1 ? '' : 's'}`}
                </p>

                {searchHits.map((hit) => {
                  const isEditingThis = editingHitKey === hit.key;
                  const isAttached = attachedIds.has(hit.file.id);
                  const charDelta = isEditingThis ? editDraft.length - hit.section.text.length : 0;

                  return (
                    <div
                      key={hit.key}
                      className="rounded-xl border border-abyss-700/40 bg-abyss-950/50 p-3 sm:p-3.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-amber-200">{hit.file.title}</span>
                            <span className="rounded-full border border-abyss-600/40 bg-abyss-900/70 px-2 py-0.5 text-[10px] font-medium text-abyss-200">
                              {hit.matchCount} match{hit.matchCount === 1 ? '' : 'es'}
                            </span>
                          </div>
                          <p className="mt-0.5 break-words text-sm font-semibold text-pearl">
                            {hit.section.heading}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          {!isAttached && (
                            <button
                              type="button"
                              onClick={() => toggleAttached(hit.file.id)}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-abyss-500/40 bg-abyss-900/60 px-2.5 py-1 text-[11px] font-medium text-abyss-200 hover:text-pearl"
                              title="Attach this file to Dev Chat"
                            >
                              + Attach
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => copySectionText(hit)}
                            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-abyss-500/40 bg-abyss-900/60 px-2.5 py-1 text-[11px] font-medium text-muted hover:text-pearl"
                            title="Copy just this Markdown section"
                          >
                            {copiedHitKey === hit.key ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400"/>
                            ) : (
                              <Copy className="h-3.5 w-3.5"/>
                            )}
                            <span>{copiedHitKey === hit.key ? 'Copied' : 'Copy'}</span>
                          </button>
                          {!isEditingThis && (
                            <button
                              type="button"
                              onClick={() => startPatchSection(hit)}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25"
                            >
                              <Edit3 className="h-3.5 w-3.5"/>
                              <span>Patch Section</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {!isEditingThis ? (
                        <p className="mt-2 break-words rounded-lg bg-abyss-900/50 px-2.5 py-2 font-mono text-xs leading-relaxed text-muted">
                          {hit.snippet}
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                            <span>
                              Editing only this section ({hit.section.text.length.toLocaleString()} chars original)
                            </span>
                            <span
                              className={`font-mono font-semibold ${
                                charDelta > 0
                                  ? 'text-emerald-300'
                                  : charDelta < 0
                                    ? 'text-amber-300'
                                    : 'text-muted'
                              }`}
                            >
                              {charDelta > 0 ? `+${charDelta}` : charDelta} chars
                            </span>
                          </div>

                          <textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            rows={10}
                            spellCheck={false}
                            className="min-h-[12rem] w-full resize-y rounded-xl border border-amber-400/40 bg-abyss-950/85 p-3 font-mono text-xs leading-6 text-pearl outline-none focus:border-amber-300/70 sm:text-sm"
                          />

                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelPatchSection}
                              disabled={savingSection}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-abyss-500/40 px-3 py-1.5 text-xs font-medium text-muted hover:text-pearl disabled:opacity-40"
                            >
                              <X className="h-3.5 w-3.5"/>
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSaveSection(hit)}
                              disabled={savingSection}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500/90 to-amber-400/90 px-3.5 py-1.5 text-xs font-semibold text-abyss-950 transition-opacity hover:opacity-95 disabled:opacity-50"
                            >
                              {savingSection ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin"/>
                              ) : (
                                <Save className="h-3.5 w-3.5"/>
                              )}
                              <span>{savingSection ? 'Saving...' : 'Save Section'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- SCANNER (SCROLLABLE MIDDLE PANE) ---------- */}
      {!loading && !loadError && studioTab === 'scanner' && (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4 lg:px-0 lg:py-0">
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
              <ClipboardList className="h-4 w-4"/>
              Send Version Audit to Dev Chat
            </button>
          </div>

          <div className="glass-panel overflow-hidden rounded-2xl">
            {scanRows.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">No rule files to scan yet.</p>
            ) : (
              <>
                {/* MOBILE STACKED CARDS (zero horizontal cutoff) */}
                <div className="divide-y divide-abyss-800/40 md:hidden">
                  {scanRows.map((row) => (
                    <div key={row.file.id} className="space-y-1.5 px-3.5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-pearl">{row.file.title}</p>
                          <p className="text-[11px] text-muted">{row.file.category}</p>
                        </div>
                        {row.status === 'unchanged' ? (
                          <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            Unchanged
                          </span>
                        ) : row.status === 'modified' ? (
                          <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            Modified
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full border border-coral-400/30 bg-coral-500/15 px-2 py-0.5 text-[10px] font-semibold text-coral-300">
                            New
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-pearl">
                          {row.versionTag ? `v${row.versionTag}` : 'Untagged'}
                        </span>
                        <span className="truncate font-mono text-foam-300">{row.recommendation}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* TABLET & DESKTOP FULL TABLE */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
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
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------- DEV CHAT (ONLY MESSAGE FEED SCROLLS; COMPOSER PINNED) ---------- */}
      {!loading && !loadError && studioTab === 'chat' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:glass-panel lg:rounded-2xl">
          {/* ONLY SCROLLABLE CHAT FEED */}
          <div
            ref={feedRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4"
          >
            {chatHistoryLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin"/>
                Loading your saved conversation...
              </div>
            ) : (
              <>
                {chatMessages.length === 0 && !chatSending && (
                  <div className="rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/30 p-4 text-center sm:p-5">
                    <p className="mb-3 text-sm text-muted">
                      Chat freely about rules, lore, balance, and edits. Check the files you want in
                      Rule Tools first so the assistant can read them.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {starterChats.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => {
                            setChatInput(chip);
                            window.setTimeout(() => {
                              autoGrowInput();
                              inputRef.current?.focus();
                            }, 0);
                          }}
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
                          message.role === 'user' ? 'text-abyss-200/70' : 'text-amber-200/70'
                        }`}
                      >
                        {message.role === 'user' ? 'You' : 'Dev Assistant'}
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
                            <Check className="h-4 w-4 text-emerald-400"/>
                          ) : (
                            <Copy className="h-4 w-4"/>
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
                            <Loader2 className="h-4 w-4 animate-spin"/>
                          ) : (
                            <Trash2 className="h-4 w-4"/>
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
                      <div className={`min-w-0 break-words ${fontFamilyClass}`} style={{ fontSize: fontPx }}>
                        <MarkdownChat content={message.content}/>
                      </div>
                    )}
                  </div>
                ))}

                {chatSending && (
                  <div className="rounded-2xl border border-abyss-600/30 bg-abyss-950/40 p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <Loader2 className="h-4 w-4 animate-spin"/>
                      The Dev Assistant is thinking...
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* PINNED BOTTOM COMPOSER */}
          <div className="shrink-0 border-t border-abyss-700/35 bg-abyss-950/90 px-3 py-2 backdrop-blur-xl sm:px-5 sm:py-3 lg:bg-abyss-950/40 lg:backdrop-blur-none">
            {chatError && (
              <div className="mb-2 flex items-start gap-2 rounded-xl border border-coral-500/30 bg-coral-900/20 px-3 py-2 text-xs text-coral-200 sm:text-sm">
                <X className="mt-0.5 h-4 w-4 shrink-0"/>
                <span>{chatError}</span>
              </div>
            )}

            <div className="mb-1.5 flex items-center gap-2 text-[11px] text-muted">
              <span className="shrink-0">
                <strong className="text-pearl">{attachedFiles.length}</strong> file
                {attachedFiles.length === 1 ? '' : 's'} · ~{attachedTokens.toLocaleString()} tok
              </span>
              <button
                type="button"
                onClick={() => setStudioTab('tools')}
                className="shrink-0 rounded-full border border-abyss-500/40 px-2 py-0.5 font-medium text-abyss-200 transition-colors hover:text-pearl"
              >
                Files
              </button>
              {activeModelLabel && (
                <span className="ml-auto truncate text-muted/80">{activeModelLabel}</span>
              )}
            </div>

            <div className="relative min-w-0">
              <textarea
                ref={inputRef}
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  autoGrowInput();
                }}
                onKeyDown={(e) => handleChatKeyDown(e, handleSend)}
                placeholder="Ask the Dev Assistant anything..."
                rows={1}
                className="min-h-11 max-h-28 w-full resize-none overflow-y-auto rounded-xl border border-abyss-600/40 bg-abyss-900/70 py-2.5 pl-3.5 pr-12 text-sm leading-relaxed text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
              />
              <button
                type="button"
                onClick={chatSending ? () => abortControllerRef.current?.abort() : handleSend}
                disabled={!chatSending && !chatInput.trim()}
                className="absolute bottom-2 right-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-pearl/75 transition-colors hover:bg-abyss-700/50 hover:text-pearl disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={chatSending ? 'Stop response' : 'Send message'}
                title={chatSending ? 'Stop generating' : 'Send (Enter)'}
              >
                {chatSending ? (
                  <Square className="h-[18px] w-[18px] fill-current"/>
                ) : (
                  <Send className="h-[18px] w-[18px]"/>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* READ-ONLY QUICK PEEK MODAL */}
      {peekFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-abyss-950/80 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setPeekFile(null)}
        >
          <div
            className="glass-panel flex max-h-[85dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-abyss-600/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-abyss-700/40 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-semibold text-pearl">{peekFile.title}</p>
                <p className="text-xs text-muted">
                  {peekFile.category} · {(peekFile.content.length / 1000).toFixed(1)}k chars
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(peekFile.content);
                    setPeekCopied(true);
                    window.setTimeout(() => setPeekCopied(false), 1800);
                  }}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-abyss-500/40 px-2.5 py-1 text-xs font-medium text-muted hover:text-pearl"
                >
                  {peekCopied ? <Check className="h-3.5 w-3.5 text-emerald-400"/> : <Copy className="h-3.5 w-3.5"/>}
                  {peekCopied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => setPeekFile(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-abyss-500/40 text-muted hover:text-pearl"
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4"/>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-muted sm:text-sm">
                {peekFile.content || 'This file is currently empty.'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}