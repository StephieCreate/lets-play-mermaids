import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Clipboard, ChevronDown, Edit3, FileText, LockKeyhole, Search, Waves } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { RuleDocument } from '@/types/database';
import GameCartridgeControls from '@/components/GameCartridgeControls';
import type { CartridgeRule } from '@/lib/gameCartridge';

interface RulesPageProps {
  onBack: () => void;
  onSignIn: () => void;
  embedded?: boolean;
}

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
  { slug: 'medicinal-algae-quick-reference', title: 'Medicinal Algae Quick Reference Guide', available: true, badge: 'always' },
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
  return documents.reduce<Drafts>((drafts, document) => {
    if (document.slug in drafts) {
      drafts[document.slug] = document.content;
    }
    return drafts;
  }, { ...emptyDrafts });
}

function Badge({ kind }: { kind: RuleTab['badge'] }) {
  if (kind === 'always') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Always active
      </span>
    );
  }
  if (kind === 'opt-in') {
    return (
      <span className="shrink-0 rounded-full border border-teal-400/30 bg-teal-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-teal-300">
        Opt-in
      </span>
    );
  }
  if (kind === 'available') {
    return (
      <span className="shrink-0 rounded-full border border-sky-400/30 bg-sky-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-300">
        Available
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-300">
      In dev
    </span>
  );
}

export default function RulesPage({ onBack, onSignIn, embedded = false }: RulesPageProps) {
  const { user, loading: authLoading } = useAuth();
  const [activeSlug, setActiveSlug] = useState<string>(coreRules[0].slug);
  const [drafts, setDrafts] = useState<Drafts>({ ...emptyDrafts });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    'core-rules': false,
    'apex-plugins': false,
    'triad-tabs': false,
    'npc-tabs': false,
  });
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const activeTab = allTabs.find((tab) => tab.slug === activeSlug) ?? coreRules[0];
  const activeContent = drafts[activeSlug] ?? '';

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
  }, [activeSlug]);

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

  const replaceNext = () => {
    if (!searchText) return;
    const start = editorRef.current?.selectionEnd ?? 0;
    const nextIndex = activeContent.indexOf(searchText, start) >= 0
      ? activeContent.indexOf(searchText, start)
      : activeContent.indexOf(searchText);
    if (nextIndex < 0) return;

    updateActiveContent(
      `${activeContent.slice(0, nextIndex)}${replaceText}${activeContent.slice(nextIndex + searchText.length)}`,
    );
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(nextIndex, nextIndex + replaceText.length);
    });
  };

  const replaceAll = () => {
    if (!searchText) return;
    updateActiveContent(activeContent.split(searchText).join(replaceText));
  };

  const handleAccept = async () => {
    if (!user) {
      onSignIn();
      return;
    }

    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase.from('rule_documents').upsert(
      { slug: activeSlug, title: activeTab.title, content: activeContent, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,slug' },
    );

    if (saveError) {
      console.error('Could not save rule document', saveError);
      setError('Your changes could not be saved. Please try again.');
    } else {
      setEditing(false);
    }
    setSaving(false);
  };

  const selectTab = (tab: RuleTab) => {
    if (!tab.available) return;
    setActiveSlug(tab.slug);
    setEditing(false);
  };

  const renderTabButton = (tab: RuleTab) => {
    const selected = tab.slug === activeSlug;
    const disabled = !tab.available;
    return (
      <button
        key={tab.slug}
        onClick={() => selectTab(tab)}
        disabled={disabled}
        className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-medium transition-all ${
          selected
            ? 'bg-abyss-500/25 text-pearl shadow-inner shadow-abyss-300/5'
            : disabled
              ? 'cursor-not-allowed text-muted/50'
              : 'text-muted hover:bg-abyss-800/50 hover:text-pearl'
        }`}
      >
        <span className="min-w-0">
          <span className="block">{tab.title}</span>
          {tab.subtitle && (
            <span className="mt-0.5 block text-xs text-current/70">{tab.subtitle}</span>
          )}
        </span>
        <Badge kind={tab.badge} />
      </button>
    );
  };

  return (
    <main className={`relative z-10 overflow-hidden px-3 pb-16 ${embedded ? 'pt-4 sm:pt-6' : 'min-h-screen pt-28 sm:pb-24 sm:pt-32'} lg:px-8`}>
      <div className="mx-auto max-w-6xl">
        {!embedded && (
          <button
            onClick={onBack}
            className="group mb-8 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-pearl sm:mb-10"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to the ocean
          </button>
        )}

        <div className={`max-w-3xl ${embedded ? 'mb-6' : 'mb-8 sm:mb-10'}`}>
          <div className={`flex items-center gap-3 text-abyss-300/60 ${embedded ? 'mb-3' : 'mb-4 sm:mb-5'}`}>
            <FileText className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.24em]">The Codex</span>
          </div>
          <h1 className={`font-display font-semibold leading-[1.08] text-pearl text-glow-soft ${embedded ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-6xl'}`}>
            Rules of the Deep
          </h1>
          <p className={`leading-relaxed text-muted ${embedded ? 'mt-3 text-sm sm:text-base' : 'mt-4 text-base sm:mt-5 sm:text-lg'}`}>
Your core references, apex plugin rules, and triad opt-in appendix for building and playing stories beneath the waves.
          </p>
        </div>

        {user && (
          <div className="mb-6 max-w-3xl">
            <GameCartridgeControls userId={user.id} onRulesImported={handleRulesImported} />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-6 lg:items-start">
          <nav className="glass-panel rounded-2xl p-2" aria-label="Rule tabs">
            {([
              { key: 'core-rules', label: 'Core rules', tabs: coreRules },
              { key: 'apex-plugins', label: 'Apex plugins', tabs: apexPlugins },
              { key: 'triad-tabs', label: 'Triad opt-in', tabs: triadTabs },
              { key: 'npc-tabs', label: 'NPC opt-in', tabs: npcTabs },
            ] as const).map((section, sectionIndex) => {
              const collapsed = collapsedSections[section.key];
              return (
                <div key={section.key} className={sectionIndex > 0 ? 'pt-1' : ''}>
                  <button
                    onClick={() => setCollapsedSections((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
                    className="flex w-full items-center justify-between gap-2 px-4 pb-2 pt-2 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300/70 transition-colors hover:text-abyss-200/90"
                    aria-expanded={!collapsed}
                  >
                    <span>{section.label}</span>
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`} />
                  </button>
                  {!collapsed && (
                    <div className="flex flex-col gap-2 pb-1">
                      {section.tabs.map(renderTabButton)}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <section className="glass-panel min-w-0 rounded-2xl p-4 sm:p-8">
            <div className="flex flex-col gap-4 border-b border-abyss-700/30 pb-5 sm:gap-5 sm:pb-6">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300/70">
                  {activeTab.badge === 'always'
                    ? 'Core reference'
                    : activeTab.badge === 'opt-in' && activeTab.slug.startsWith('triad-')
                      ? 'Triad appendix'
                      : activeTab.badge === 'opt-in' && activeTab.slug.startsWith('npc-')
                        ? 'NPC appendix'
                        : activeTab.badge === 'available' && activeTab.slug.startsWith('triad-')
                          ? 'Triad surrogate'
                          : 'Apex plugin'}
                </p>
                <h2 className="break-words font-display text-2xl font-semibold text-pearl sm:text-3xl">
                  {activeTab.title}
                  {activeTab.subtitle && (
                    <span className="ml-3 text-base font-normal text-muted sm:text-lg">{activeTab.subtitle}</span>
                  )}
                </h2>
              </div>
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                <button
                  onClick={handleCopy}
                  disabled={loading || !activeContent}
                  className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-abyss-500/30 px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                {editing ? (
                  <button
                    onClick={handleAccept}
                    disabled={saving || loading}
                    className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-abyss-500/80 px-3 py-2 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                  >
                    <Check className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Accept'}
                  </button>
                ) : (
                  <button
                    onClick={() => user ? setEditing(true) : onSignIn()}
                    className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-abyss-400/40 bg-abyss-700/30 px-3 py-2 text-sm font-medium text-pearl transition-colors hover:border-abyss-300/60 hover:bg-abyss-600/40 sm:flex-none"
                  >
                    <Edit3 className="h-4 w-4" />
                    {user ? 'Edit' : 'Sign in to edit'}
                  </button>
                )}
              </div>
            </div>

            {editing && (
              <div className="mt-6 rounded-xl border border-abyss-600/30 bg-abyss-950/35 p-3 sm:p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  <Search className="h-3.5 w-3.5" />
                  Find and replace
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Find"
                    className="min-h-11 rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-3 py-2 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                  />
                  <input
                    value={replaceText}
                    onChange={(event) => setReplaceText(event.target.value)}
                    placeholder="Replace with"
                    className="min-h-11 rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-3 py-2 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                  />
                  <button onClick={replaceNext} className="min-h-11 rounded-lg border border-abyss-600/40 px-3 py-2 text-sm text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl">Replace</button>
                  <button onClick={replaceAll} className="min-h-11 rounded-lg border border-abyss-600/40 px-3 py-2 text-sm text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl">All</button>
                </div>
              </div>
            )}

            {error && <p className="mt-5 rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-300">{error}</p>}

            {authLoading || loading ? (
              <div className="flex min-h-[24rem] items-center justify-center text-sm text-muted">Loading your codex...</div>
            ) : !user ? (
              <div className="mt-6 flex min-h-[24rem] flex-col items-center justify-center rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/25 px-6 text-center">
                <LockKeyhole className="h-7 w-7 text-abyss-300/70" />
                <h3 className="mt-4 font-display text-xl font-medium text-pearl">Your private rules archive</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">Sign in to paste, edit, save, and copy your markdown rule references.</p>
                <button onClick={onSignIn} className="mt-6 min-h-11 rounded-lg bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400">Sign in to continue</button>
              </div>
            ) : editing ? (
              <textarea
                ref={editorRef}
                value={activeContent}
                onChange={(event) => updateActiveContent(event.target.value)}
                placeholder="Paste your markdown rules here..."
                className="mt-5 min-h-[22rem] w-full resize-y rounded-xl border border-abyss-600/40 bg-abyss-950/50 p-4 font-mono text-sm leading-7 text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60 sm:mt-6 sm:min-h-[28rem]"
                spellCheck={false}
              />
            ) : (
              <pre className="mt-5 min-h-[20rem] whitespace-pre-wrap rounded-xl border border-abyss-700/30 bg-abyss-950/30 p-4 font-mono text-sm leading-7 text-muted sm:mt-6 sm:min-h-[24rem]">
                {activeContent || 'No markdown has been added to this reference yet. Click Edit to paste it in.'}
              </pre>
            )}

            <div className="mt-6 flex items-center gap-3 text-sm text-muted/70">
              <Waves className="h-4 w-4 text-abyss-300/60" />
              Markdown is stored as plain text and stays in your private archive.
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
