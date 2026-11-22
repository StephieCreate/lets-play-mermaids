import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Edit3,
  FileText,
  LockKeyhole,
  MessageSquare,
  Search,
  ShoppingBag,
  Terminal,
  Waves,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { RuleDocument } from '@/types/database';
import RulesStorePanel from '@/components/RulesStorePanel';
import RulesHelperChat from '@/components/RulesHelperChat';
import DevModeStudio from '@/components/DevModeStudio';
import type { CartridgeRule } from '@/lib/gameCartridge';

interface RulesPageProps {
  onBack: () => void;
  onSignIn: () => void;
  hasRulesUpdate?: boolean;
  embedded?: boolean;
}

type RulesSubTab = 'codex' | 'helper' | 'store' | 'dev';

type RuleTab = {
  slug: string;
  title: string;
  subtitle?: string;
  available: boolean;
  badge: 'always' | 'available' | 'dev' | 'opt-in';
};

const coreRules: RuleTab[] = [
  { slug: 'universal-core-engine', title: 'Universal Core Engine', available: true, badge: 'always' },
  { slug: 'universal-game-templates', title: 'Universal Game Templates', available: true, badge: 'always' },
  {
    slug: 'medicinal-algae-quick-reference',
    title: 'Medicinal Algae Quick Reference Guide',
    available: true,
    badge: 'always',
  },
  {
    slug: 'lets-play-mermaids-world-lore',
    title: "Let's Play Mermaids World Lore Engine",
    available: true,
    badge: 'always',
  },
];

const apexPlugins: RuleTab[] = [
  { slug: 'apex-kial', title: 'Kial', subtitle: 'Bull Shark', available: true, badge: 'available' },
  { slug: 'apex-severin', title: 'Severin', subtitle: 'Great White', available: true, badge: 'available' },
  { slug: 'apex-ezra', title: 'Ezra', subtitle: 'Orca', available: true, badge: 'available' },
  { slug: 'apex-malibu', title: 'Malibu', subtitle: 'Tiger Shark', available: true, badge: 'available' },
  { slug: 'apex-ricsa', title: 'Ricsa', subtitle: 'Oceanic White-tip', available: true, badge: 'available' },
  { slug: 'apex-akuma', title: 'Akuma', subtitle: 'Humboldt Squid', available: false, badge: 'dev' },
  { slug: 'apex-vanna', title: 'Vanna', subtitle: 'Silkie Shark', available: false, badge: 'dev' },
  { slug: 'apex-idris', title: 'Idris', subtitle: 'Great Hammerhead', available: true, badge: 'available' },
];

const triadTabs: RuleTab[] = [
  { slug: 'triad-core', title: 'Triad Core Rule', available: true, badge: 'opt-in' },
  { slug: 'triad-surrogate-elian', title: 'Elian', subtitle: 'Surrogate', available: true, badge: 'available' },
  { slug: 'triad-surrogate-garil', title: 'Garil', subtitle: 'Surrogate', available: true, badge: 'available' },
  { slug: 'triad-surrogate-heon', title: 'Heon', subtitle: 'Surrogate', available: true, badge: 'available' },
  { slug: 'triad-surrogate-lorian', title: 'Lorian', subtitle: 'Surrogate', available: true, badge: 'available' },
  { slug: 'triad-surrogate-netia', title: 'Netia', subtitle: 'Surrogate', available: true, badge: 'available' },
  { slug: 'triad-surrogate-nyx', title: 'Nyx', subtitle: 'Surrogate', available: true, badge: 'available' },
  { slug: 'triad-surrogate-rion', title: 'Rion', subtitle: 'Surrogate', available: true, badge: 'available' },
  { slug: 'triad-surrogate-shyan', title: 'Shyan', subtitle: 'Surrogate', available: true, badge: 'available' },
  { slug: 'triad-surrogate-sira', title: 'Sira', subtitle: 'Surrogate', available: true, badge: 'available' },
  { slug: 'triad-surrogate-vesper', title: 'Vesper', subtitle: 'Surrogate', available: true, badge: 'available' },
];

const npcTabs: RuleTab[] = [
  { slug: 'npc-kip-translator', title: 'Kip', subtitle: 'Translator NPC', available: true, badge: 'opt-in' },
];

const allTabs = [...coreRules, ...apexPlugins, ...triadTabs, ...npcTabs];
type Drafts = Record<string, string>;

const emptyDrafts: Drafts = allTabs.reduce((drafts, tab) => {
  drafts[tab.slug] = '';
  return drafts;
}, {} as Drafts);

function toDrafts(documents: RuleDocument[]): Drafts {
  return documents.reduce<Drafts>(
    (drafts, document) => {
      if (document.slug in drafts) {
        drafts[document.slug] = document.content;
      }
      return drafts;
    },
    { ...emptyDrafts },
  );
}

function Badge({ kind }: { kind: RuleTab['badge'] }) {
  if (kind === 'always') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Active
      </span>
    );
  }
  if (kind === 'opt-in') {
    return (
      <span className="shrink-0 rounded-full border border-teal-400/30 bg-teal-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-teal-300">
        Opt-in
      </span>
    );
  }
  if (kind === 'available') {
    return (
      <span className="shrink-0 rounded-full border border-sky-400/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-sky-300">
        Available
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-300">
      In dev
    </span>
  );
}

export default function RulesPage({ onBack, onSignIn, hasRulesUpdate = false, embedded = false }: RulesPageProps) {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const isWhitelistedAdmin = isAdmin;

  const [subTab, setSubTab] = useState<RulesSubTab>('codex');
  const [mobileView, setMobileView] = useState<'list' | 'doc'>('list');

  const [activeSlug, setActiveSlug] = useState<string>(coreRules[0].slug);
  const [drafts, setDrafts] = useState<Drafts>({ ...emptyDrafts });
  const [preEditContent, setPreEditContent] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find & Replace state (hidden by default while editing)
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  // Core Rules starts expanded; secondary sections start collapsed so mobile list stays scannable
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    'core-rules': false,
    'apex-plugins': true,
    'triad-tabs': true,
    'npc-tabs': true,
  });

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const activeTab = allTabs.find((tab) => tab.slug === activeSlug) ?? coreRules[0];
  const activeContent = drafts[activeSlug] ?? '';

  // Safeguard: never allow non-admins to land on Dev Mode
  useEffect(() => {
    if (!isWhitelistedAdmin && subTab === 'dev') {
      setSubTab('codex');
    }
  }, [isWhitelistedAdmin, subTab]);

  useEffect(() => {
    if (!user) {
      setDrafts({ ...emptyDrafts });
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('rule_documents')
      .select('id, user_id, slug, title, content, created_at, updated_at')
      .order('created_at', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          console.error('Could not load rule documents', fetchError);
          setError('The rules could not be loaded. Please try again.');
        } else {
          setDrafts(toDrafts((data ?? []) as RuleDocument[]));
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    setCopied(false);
    setSearchText('');
    setReplaceText('');
    setCurrentMatchIdx(0);
    setShowFindReplace(false);
  }, [activeSlug]);

  // Compute all case-insensitive match positions in the active document
  const matchPositions = useMemo(() => {
    if (!searchText) return [];
    const positions: number[] = [];
    const haystack = activeContent.toLowerCase();
    const needle = searchText.toLowerCase();
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      positions.push(idx);
      idx = haystack.indexOf(needle, idx + needle.length);
    }
    return positions;
  }, [activeContent, searchText]);

  // Keep currentMatchIdx in bounds when text or query changes
  useEffect(() => {
    if (matchPositions.length === 0) {
      setCurrentMatchIdx(0);
    } else if (currentMatchIdx >= matchPositions.length) {
      setCurrentMatchIdx(0);
    }
  }, [matchPositions.length, currentMatchIdx]);

  const scrollAndSelectMatch = (pos: number, length: number) => {
    const textarea = editorRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.setSelectionRange(pos, pos + length);

    // Estimate line offset so the textarea scrolls the highlighted match into view
    const linesBefore = activeContent.slice(0, pos).split('\n').length - 1;
    const approxLineHeight = 26;
    const targetScrollTop = Math.max(0, linesBefore * approxLineHeight - textarea.clientHeight / 3);
    textarea.scrollTop = targetScrollTop;
  };

  const handleFindStep = (direction: 1 | -1) => {
    if (matchPositions.length === 0) return;
    const nextIdx = (currentMatchIdx + direction + matchPositions.length) % matchPositions.length;
    setCurrentMatchIdx(nextIdx);
    scrollAndSelectMatch(matchPositions[nextIdx], searchText.length);
  };

  const handleRulesImported = (imported: CartridgeRule[]) => {
    setDrafts((current) => ({
      ...current,
      ...Object.fromEntries(imported.map((rule) => [rule.slug, rule.content])),
    }));
  };

  const updateActiveContent = (content: string) => {
    setDrafts((current) => ({ ...current, [activeSlug]: content }));
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeContent);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleStartEdit = () => {
    if (!isAdmin) return;
    if (!user) {
      onSignIn();
      return;
    }
    setPreEditContent(activeContent);
    setEditing(true);
    setShowFindReplace(false);
  };

  const handleCancelEdit = () => {
    updateActiveContent(preEditContent);
    setEditing(false);
    setShowFindReplace(false);
    setError(null);
  };

  const replaceCurrent = () => {
    if (!searchText || matchPositions.length === 0) return;
    const safeIdx = Math.min(currentMatchIdx, matchPositions.length - 1);
    const pos = matchPositions[safeIdx];

    const updated =
      activeContent.slice(0, pos) + replaceText + activeContent.slice(pos + searchText.length);
    updateActiveContent(updated);

    window.requestAnimationFrame(() => {
      const textarea = editorRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(pos, pos + replaceText.length);
    });
  };

  const replaceAll = () => {
    if (!searchText || matchPositions.length === 0) return;
    // Escape regex special characters for case-insensitive global replace
    const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const updated = activeContent.replace(new RegExp(escaped, 'gi'), replaceText);
    updateActiveContent(updated);
    setCurrentMatchIdx(0);
  };

  const handleAccept = async () => {
    if (!user) {
      onSignIn();
      return;
    }

    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase.from('rule_documents').upsert(
      {
        slug: activeSlug,
        title: activeTab.title,
        content: activeContent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,slug' },
    );

    if (saveError) {
      console.error('Could not save rule document', saveError);
      setError('Your changes could not be saved. Please try again.');
    } else {
      setEditing(false);
      setShowFindReplace(false);
    }
    setSaving(false);
  };

  const selectTab = (tab: RuleTab) => {
    if (!tab.available) return;
    setActiveSlug(tab.slug);
    setEditing(false);
    setShowFindReplace(false);
    setMobileView('doc');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderTabButton = (tab: RuleTab) => {
    const selected = tab.slug === activeSlug;
    const disabled = !tab.available;
    return (
      <button
        key={tab.slug}
        type="button"
        onClick={() => selectTab(tab)}
        disabled={disabled}
        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium transition-all ${
          selected
            ? 'bg-abyss-500/25 text-pearl shadow-inner shadow-abyss-300/5'
            : disabled
              ? 'cursor-not-allowed text-muted/45'
              : 'text-muted hover:bg-abyss-800/50 hover:text-pearl'
        }`}
      >
        <span className="min-w-0">
          <span className="leading-snug">{tab.title}</span>
          {tab.subtitle && (
            <span className="mt-0.5 block truncate text-xs text-current/70">{tab.subtitle}</span>
          )}
        </span>
        <Badge kind={tab.badge} />
      </button>
    );
  };

  const categoryLabel =
    activeTab.badge === 'always'
      ? 'Core reference'
      : activeTab.badge === 'opt-in' && activeTab.slug.startsWith('triad-')
        ? 'Triad appendix'
        : activeTab.badge === 'opt-in' && activeTab.slug.startsWith('npc-')
          ? 'NPC appendix'
          : activeTab.badge === 'available' && activeTab.slug.startsWith('triad-')
            ? 'Triad surrogate'
            : 'Apex plugin';

  return (
    <main
      className={`relative z-10 ${
        embedded ? 'pt-2 pb-10 sm:pt-4' : 'min-h-screen px-3 pt-24 pb-16 sm:pt-28 lg:px-8'
      }`}
    >
      <div className="mx-auto max-w-6xl">
        {!embedded && (
          <button
            type="button"
            onClick={onBack}
            className="group mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-pearl"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to the ocean
          </button>
        )}

        {/* Hide main header on mobile when drilled into a document so editor gets maximum screen */}
        <div className={`${subTab === 'codex' && mobileView === 'doc' ? 'hidden lg:block' : 'block'} mb-5`}>
          <div className="mb-2 flex items-center gap-2.5 text-abyss-300/65">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.22em]">The Codex</span>
          </div>
          <h1 className="font-display text-3xl font-semibold leading-tight text-pearl text-glow-soft sm:text-4xl">
            Rules of the Deep
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Core references, apex plugins, cartridge store, and your rules helper — all in one place.
          </p>
        </div>

        {/* SUB-TAB PILL STRIP */}
        <div
          className={`${
            subTab === 'codex' && mobileView === 'doc' ? 'hidden lg:flex' : 'flex'
          } glass-panel mb-6 items-center gap-1 rounded-2xl p-1.5`}
        >
          <button
            type="button"
            onClick={() => setSubTab('codex')}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium leading-none transition-all sm:min-h-10 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
              subTab === 'codex'
                ? 'bg-abyss-500/35 text-pearl shadow-sm'
                : 'text-muted hover:bg-abyss-800/40 hover:text-pearl'
            }`}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">Codex</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('helper')}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium leading-none transition-all sm:min-h-10 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
              subTab === 'helper'
                ? 'bg-abyss-500/35 text-pearl shadow-sm'
                : 'text-muted hover:bg-abyss-800/40 hover:text-pearl'
            }`}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">Helper AI</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('store')}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium leading-none transition-all sm:min-h-10 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
              subTab === 'store'
                ? 'bg-abyss-500/35 text-pearl shadow-sm'
                : 'text-muted hover:bg-abyss-800/40 hover:text-pearl'
            }`}
          >
            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
              <ShoppingBag className="h-4 w-4" />
              {hasRulesUpdate && (
                <span
                  className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 shadow-sm shadow-red-950/70 ring-2 ring-abyss-950"
                  aria-label="New rules update available"
                />
              )}
            </span>
            <span className="whitespace-nowrap">Store</span>
          </button>

          {/* HIDDEN ADMIN-ONLY DEV MODE TAB — never rendered in DOM for non-admins */}
          {isWhitelistedAdmin && (
            <button
              type="button"
              onClick={() => setSubTab('dev')}
              className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium leading-none transition-all sm:min-h-10 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
                subTab === 'dev'
                  ? 'border border-amber-400/40 bg-amber-500/20 text-amber-200 shadow-sm'
                  : 'text-amber-300/75 hover:bg-amber-500/10 hover:text-amber-200'
              }`}
            >
              <Terminal className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Dev Mode</span>
            </button>
          )}
        </div>

        {/* ==================== SUB-TAB 1: CODEX ==================== */}
        {subTab === 'codex' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start lg:gap-6">
            {/* STEP A (Mobile Directory) / Left Column (Desktop) */}
            <nav
              className={`glass-panel min-w-0 rounded-2xl p-2 ${mobileView === 'doc' ? 'hidden lg:block' : 'block'}`}
              aria-label="Rule tabs"
            >
              {(
                [
                  { key: 'core-rules', label: 'Core rules', tabs: coreRules },
                  { key: 'apex-plugins', label: 'Apex plugins', tabs: apexPlugins },
                  { key: 'triad-tabs', label: 'Triad opt-in', tabs: triadTabs },
                  { key: 'npc-tabs', label: 'NPC opt-in', tabs: npcTabs },
                ] as const
              ).map((section, sectionIndex) => {
                const collapsed = collapsedSections[section.key];
                return (
                  <div key={section.key} className={sectionIndex > 0 ? 'mt-1 border-t border-abyss-700/25 pt-2' : ''}>
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedSections((prev) => ({
                          ...prev,
                          [section.key]: !prev[section.key],
                        }))
                      }
                      className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-abyss-300/75 transition-colors hover:bg-abyss-800/35 hover:text-abyss-200"
                      aria-expanded={!collapsed}
                    >
                      <span>{section.label}</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                          collapsed ? '-rotate-90' : ''
                        }`}
                      />
                    </button>
                    {!collapsed && (
                      <div className="flex flex-col gap-1 pb-1 pt-1">
                        {section.tabs.map(renderTabButton)}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* STEP B (Mobile Fullscreen Doc) / Right Column (Desktop) */}
            <section
              className={`glass-panel min-w-0 rounded-2xl p-4 sm:p-6 lg:p-8 ${
                mobileView === 'list' ? 'hidden lg:block' : 'block'
              }`}
            >
              {/* Sticky Action Bar (pinned while scrolling/editing on phone) */}
              <div className="sticky top-14 z-20 -mx-4 -mt-4 mb-5 rounded-t-2xl border-b border-abyss-700/30 bg-abyss-950/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:-mt-6 sm:px-6 lg:static lg:mx-0 lg:mt-0 lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-5 lg:backdrop-blur-none">
                <div className="flex items-center justify-between gap-2">
                  {/* Mobile Back Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (editing) handleCancelEdit();
                      setMobileView('list');
                    }}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-abyss-500/30 bg-abyss-800/40 px-3 py-1.5 text-xs font-medium text-pearl transition-colors hover:bg-abyss-700/50 lg:hidden"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
                  </button>

                  {/* Desktop Title (inline in header) */}
                  <div className="hidden min-w-0 lg:block">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300/70">
                      {categoryLabel}
                    </p>
                    <h2 className="break-words font-display text-3xl font-semibold text-pearl">
                      {activeTab.title}
                      {activeTab.subtitle && (
                        <span className="ml-3 text-lg font-normal text-muted">
                          {activeTab.subtitle}
                        </span>
                      )}
                    </h2>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    {!editing ? (
                      <>
                        <button
                          type="button"
                          onClick={handleCopy}
                          disabled={loading || !activeContent}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-abyss-500/30 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
                        >
                          {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Clipboard className="h-4 w-4" />}
                          <span>{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                        {isWhitelistedAdmin ? (
                          <button
                            type="button"
                            onClick={handleStartEdit}
                            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-abyss-400/40 bg-abyss-700/35 px-3 py-1.5 text-xs font-medium text-pearl transition-colors hover:border-abyss-300/60 hover:bg-abyss-600/45 sm:text-sm"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span>{user ? 'Edit' : 'Sign in'}</span>
                          </button>
                        ) : (
                          <span className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-abyss-600/30 bg-abyss-800/20 px-3 py-1.5 text-xs font-medium text-muted/80">
                            <LockKeyhole className="h-3.5 w-3.5" />
                            <span>Read-only</span>
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          disabled={saving}
                          className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-abyss-500/30 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-pearl sm:px-3 sm:text-sm"
                        >
                          <X className="h-4 w-4" />
                          <span className="hidden sm:inline">Cancel</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowFindReplace((v) => !v)}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                            showFindReplace
                              ? 'border-foam-400/50 bg-foam-900/30 text-foam-200'
                              : 'border-abyss-500/35 bg-abyss-800/40 text-muted hover:text-pearl'
                          }`}
                          aria-label="Toggle find and replace"
                          title="Find and Replace"
                        >
                          <Search className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleAccept}
                          disabled={saving || loading}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-abyss-500 to-abyss-400 px-3.5 py-1.5 text-xs font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                        >
                          <Check className="h-4 w-4" />
                          <span>{saving ? 'Saving...' : 'Save'}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Compact 2-Row Find & Replace Drawer (only open when 🔍 is toggled) */}
                {editing && showFindReplace && (
                  <div className="mt-3 space-y-2 rounded-xl border border-abyss-600/40 bg-abyss-900/75 p-2.5">
                    {/* Row 1: Find input + Match counter + Prev / Next jump buttons */}
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={searchText}
                          onChange={(e) => {
                            setSearchText(e.target.value);
                            setCurrentMatchIdx(0);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleFindStep(e.shiftKey ? -1 : 1);
                            }
                          }}
                          placeholder="Find..."
                          className="min-h-10 w-full rounded-lg border border-abyss-600/40 bg-abyss-950/70 py-1.5 pl-3 pr-12 text-xs text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60 sm:text-sm"
                        />
                        {searchText && (
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-abyss-200/80">
                            {matchPositions.length > 0
                              ? `${currentMatchIdx + 1}/${matchPositions.length}`
                              : '0/0'}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleFindStep(-1)}
                        disabled={matchPositions.length === 0}
                        className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-lg border border-abyss-600/40 bg-abyss-950/50 text-pearl transition-colors hover:border-abyss-400/60 hover:bg-abyss-800/60 disabled:opacity-35"
                        aria-label="Previous match"
                        title="Previous match"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFindStep(1)}
                        disabled={matchPositions.length === 0}
                        className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-lg border border-abyss-600/40 bg-abyss-950/50 text-pearl transition-colors hover:border-abyss-400/60 hover:bg-abyss-800/60 disabled:opacity-35"
                        aria-label="Next match"
                        title="Next match"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Row 2: Replace input + Replace & All side-by-side */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={replaceText}
                        onChange={(e) => setReplaceText(e.target.value)}
                        placeholder="Replace with..."
                        className="min-h-10 min-w-0 flex-1 rounded-lg border border-abyss-600/40 bg-abyss-950/70 px-3 py-1.5 text-xs text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60 sm:text-sm"
                      />
                      <button
                        type="button"
                        onClick={replaceCurrent}
                        disabled={matchPositions.length === 0}
                        className="min-h-10 shrink-0 rounded-lg border border-abyss-500/40 bg-abyss-800/60 px-3 py-1.5 text-xs font-medium text-pearl transition-colors hover:bg-abyss-700/70 disabled:opacity-35"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={replaceAll}
                        disabled={matchPositions.length === 0}
                        className="min-h-10 shrink-0 rounded-lg border border-abyss-500/40 bg-abyss-800/60 px-3 py-1.5 text-xs font-medium text-pearl transition-colors hover:bg-abyss-700/70 disabled:opacity-35"
                      >
                        All
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Document Title (below sticky bar) */}
              <div className="mb-4 lg:hidden">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-abyss-300/70">
                  {categoryLabel}
                </p>
                <h2 className="break-words font-display text-2xl font-semibold text-pearl">
                  {activeTab.title}
                  {activeTab.subtitle && (
                    <span className="ml-2 text-base font-normal text-muted">
                      {activeTab.subtitle}
                    </span>
                  )}
                </h2>
              </div>

              {error && (
                <p className="mb-4 rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-300">
                  {error}
                </p>
              )}

              {authLoading || loading ? (
                <div className="flex min-h-[20rem] items-center justify-center text-sm text-muted">
                  Loading your codex...
                </div>
              ) : !user ? (
                <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/25 px-6 text-center">
                  <LockKeyhole className="h-7 w-7 text-abyss-300/70" />
                  <h3 className="mt-4 font-display text-xl font-medium text-pearl">
                    Your private rules archive
                  </h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
                    Sign in to read, edit, save, and copy your markdown rule references.
                  </p>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="mt-6 min-h-11 rounded-lg bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400"
                  >
                    Sign in to continue
                  </button>
                </div>
              ) : editing ? (
                <textarea
                  ref={editorRef}
                  value={activeContent}
                  onChange={(event) => updateActiveContent(event.target.value)}
                  placeholder="Paste your markdown rules here..."
                  className="min-h-[60svh] w-full resize-y rounded-xl border border-abyss-600/40 bg-abyss-950/55 p-3.5 font-mono text-sm leading-7 text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60 sm:min-h-[28rem] sm:p-4"
                  spellCheck={false}
                />
              ) : (
                <pre className="min-h-[20rem] whitespace-pre-wrap break-words rounded-xl border border-abyss-700/30 bg-abyss-950/35 p-3.5 font-mono text-sm leading-7 text-muted sm:min-h-[24rem] sm:p-4">
                  {activeContent ||
                    'No markdown has been added to this reference yet. Tap Edit to paste it in.'}
                </pre>
              )}

              <div className="mt-5 flex items-center gap-2.5 text-xs text-muted/70 sm:text-sm">
                <Waves className="h-4 w-4 shrink-0 text-abyss-300/60" />
                <span>Markdown is stored as plain text in your archive.</span>
              </div>
            </section>
          </div>
        )}

        {/* ==================== SUB-TAB 2: PLAYER RULES HELPER AI (Ticket 7) ==================== */}
        {subTab === 'helper' && <RulesHelperChat onSignIn={onSignIn} />}

        {/* ==================== SUB-TAB 3: STORE & CARTRIDGES ==================== */}
        {subTab === 'store' && (
          <RulesStorePanel onRulesInstalled={handleRulesImported} onSignIn={onSignIn} />
        )}

        {/* ==================== SUB-TAB 4: ADMIN DEV MODE (Ticket 5 Shell) ==================== */}
        {isWhitelistedAdmin && subTab === 'dev' && <DevModeStudio />}
      </div>
    </main>
  );
}