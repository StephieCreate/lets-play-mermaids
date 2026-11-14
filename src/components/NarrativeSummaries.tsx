import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Trash2, Check, Clipboard, ChevronDown, ChevronRight, Loader2,
  LockKeyhole, ScrollText, AlertTriangle, Edit3, BookOpen,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

interface NarrativeSummariesProps {
  playthroughId: string;
  onSignIn: () => void;
}

interface NarrativeSummary {
  id: string;
  season: string;
  year: number;
  content: string;
}

const SEASONS = [
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'fall', label: 'Fall' },
  { value: 'winter', label: 'Winter' },
] as const;

const SEASON_ORDER: Record<string, number> = { spring: 0, summer: 1, fall: 2, winter: 3 };

function seasonLabel(value: string): string {
  return SEASONS.find((s) => s.value === value)?.label ?? value;
}

function summaryTitle(s: NarrativeSummary): string {
  return `${seasonLabel(s.season)}, Year ${s.year}`;
}

export default function NarrativeSummaries({ playthroughId, onSignIn }: NarrativeSummariesProps) {
  const { user, loading: authLoading } = useAuth();
  const [summaries, setSummaries] = useState<NarrativeSummary[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSeason, setNewSeason] = useState<string>('spring');
  const [newYear, setNewYear] = useState<string>('1');
  const [adding, setAdding] = useState(false);

  const [summaryRules, setSummaryRules] = useState('');
  const [summaryRulesDraft, setSummaryRulesDraft] = useState('');
  const [editingRules, setEditingRules] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesCollapsed, setRulesCollapsed] = useState(true);

  const fetchSummaryRules = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('playthrough_notes')
      .select('content')
      .eq('playthrough_id', playthroughId)
      .eq('tab', 'narrative-summaries-rules')
      .maybeSingle();
    setSummaryRules((data?.content as string) ?? '');
    setSummaryRulesDraft((data?.content as string) ?? '');
  }, [user, playthroughId]);

  const handleSaveRules = async () => {
    setSavingRules(true);
    setError(null);
    const { error: saveError } = await supabase.from('playthrough_notes').upsert(
      { playthrough_id: playthroughId, tab: 'narrative-summaries-rules', content: summaryRulesDraft },
      { onConflict: 'playthrough_id,tab' },
    );
    setSavingRules(false);
    if (saveError) {
      console.error('Could not save summary rules', saveError);
      setError('Could not save the summary rules. Please try again.');
      return;
    }
    setSummaryRules(summaryRulesDraft);
    setEditingRules(false);
  };

  const fetchSummaries = useCallback(async () => {
    if (!user) {
      setSummaries([]);
      return;
    }
    setLoadingSummaries(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('narrative_summaries')
      .select('id, season, year, content')
      .eq('playthrough_id', playthroughId)
      .order('year', { ascending: false })
      .order('season', { ascending: false });

    if (fetchError) {
      console.error('Could not load narrative summaries', fetchError);
      setError('Narrative summaries could not be loaded.');
    } else {
      const rows = (data as NarrativeSummary[]) ?? [];
      rows.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return SEASON_ORDER[b.season] - SEASON_ORDER[a.season];
      });
      setSummaries(rows);
    }
    setLoadingSummaries(false);
  }, [user, playthroughId]);

  useEffect(() => {
    fetchSummaries();
    fetchSummaryRules();
  }, [fetchSummaries, fetchSummaryRules]);

  const handleAdd = async () => {
    const yearNum = parseInt(newYear, 10);
    if (!yearNum || yearNum < 1) {
      setError('Year must be 1 or greater.');
      return;
    }
    const exists = summaries.some((s) => s.season === newSeason && s.year === yearNum);
    if (exists) {
      setError(`A summary for ${seasonLabel(newSeason)}, Year ${yearNum} already exists.`);
      return;
    }

    setAdding(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('narrative_summaries')
      .insert({ playthrough_id: playthroughId, season: newSeason, year: yearNum, content: '' })
      .select('id, season, year, content')
      .single();

    setAdding(false);
    if (insertError || !data) {
      console.error('Could not create narrative summary', insertError);
      setError('Could not add a new summary. Please try again.');
      return;
    }

    const newSummary = data as NarrativeSummary;
    setSummaries((prev) => {
      const next = [...prev, newSummary];
      next.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return SEASON_ORDER[b.season] - SEASON_ORDER[a.season];
      });
      return next;
    });
    setEditingId(newSummary.id);
    setDraftContent('');
    setCollapsed((prev) => ({ ...prev, [newSummary.id]: false }));
    setShowAddForm(false);
    setNewSeason('spring');
    setNewYear('1');
  };

  const handleSave = async (id: string) => {
    setSavingId(id);
    setError(null);
    const { error: updateError } = await supabase
      .from('narrative_summaries')
      .update({ content: draftContent, updated_at: new Date().toISOString() })
      .eq('id', id);

    setSavingId(null);
    if (updateError) {
      console.error('Could not save narrative summary', updateError);
      setError('Your changes could not be saved.');
      return;
    }
    setSummaries((prev) =>
      prev.map((s) => (s.id === id ? { ...s, content: draftContent } : s)),
    );
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    const { error: deleteError } = await supabase.from('narrative_summaries').delete().eq('id', id);
    if (deleteError) {
      console.error('Could not delete narrative summary', deleteError);
      setError('Could not delete this summary.');
      return;
    }
    setSummaries((prev) => prev.filter((s) => s.id !== id));
  };

  const handleCopy = async (s: NarrativeSummary) => {
    await navigator.clipboard.writeText(s.content);
    setCopiedId(s.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const startEdit = (s: NarrativeSummary) => {
    setEditingId(s.id);
    setDraftContent(s.content);
    setCollapsed((prev) => ({ ...prev, [s.id]: false }));
  };

  const toggleCollapse = (id: string) => {
    if (editingId === id) return;
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectClass =
    'min-h-11 w-full appearance-none rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-3 py-2 text-sm text-pearl outline-none focus:border-abyss-400/60';

  return (
    <section className="glass-panel min-w-0 rounded-2xl p-4 sm:p-8">
      <div className="flex flex-col gap-4 border-b border-abyss-700/30 pb-5 sm:gap-5 sm:pb-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300/70">Story recaps</p>
          <h2 className="break-words font-display text-2xl font-semibold text-pearl sm:text-3xl">Narrative Summaries</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Summaries of key story beats and plot developments, organized by season and year.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div className="rounded-xl border border-abyss-600/30 bg-abyss-950/35">
          <div className="flex items-center gap-2 p-3">
            <button
              onClick={() => setRulesCollapsed((prev) => !prev)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-pearl"
              aria-label={rulesCollapsed ? 'Expand' : 'Collapse'}
            >
              {rulesCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setRulesCollapsed((prev) => !prev)}
              className="min-w-0 flex-1 truncate text-left text-sm font-medium text-pearl"
            >
              Narrative Summaries Rules
            </button>
            <span className="shrink-0 rounded-full border border-abyss-400/30 bg-abyss-600/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-abyss-200/80">AI instructions</span>
            {user && !editingRules && (
              <button
                onClick={() => { setEditingRules(true); setSummaryRulesDraft(summaryRules); setRulesCollapsed(false); }}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-abyss-600/40 px-3 text-xs text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {!rulesCollapsed && (
            <div className="border-t border-abyss-700/30 p-4">
              {editingRules ? (
                <div>
                  <p className="mb-3 flex items-center gap-2 text-xs leading-relaxed text-muted">
                    <BookOpen className="h-3.5 w-3.5 text-abyss-300/70" />
                    Paste the rules the AI should follow when reading and applying your narrative summaries.
                  </p>
                  <textarea
                    value={summaryRulesDraft}
                    onChange={(e) => setSummaryRulesDraft(e.target.value)}
                    placeholder="Paste the AI instructions for how to treat your narrative summaries..."
                    className="min-h-[10rem] w-full resize-y rounded-lg border border-abyss-600/40 bg-abyss-950/50 p-4 font-mono text-sm leading-7 text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                    spellCheck={false}
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={handleSaveRules}
                      disabled={savingRules}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-abyss-500/80 px-4 py-2 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400 disabled:opacity-50"
                    >
                      {savingRules ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingRules(false); setSummaryRulesDraft(summaryRules); }}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-abyss-600/40 px-4 py-2 text-sm text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm leading-7 text-muted">
                  {summaryRules || 'No rules pasted yet. Click the edit icon to paste the AI instructions for how to treat your narrative summaries.'}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-abyss-600/30 bg-abyss-950/35 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-abyss-300/70" />
          <p className="text-sm leading-relaxed text-muted">
            Always paste the previous day at the <span className="font-medium text-pearl">top</span> of the text field.
            The narrator reads information top-down, so the most recent day should come first.
          </p>
        </div>
      </div>

      {authLoading ? (
        <div className="mt-6 flex min-h-[8rem] items-center justify-center text-sm text-muted">Loading...</div>
      ) : !user ? (
        <div className="mt-6 flex min-h-[10rem] flex-col items-center justify-center rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/25 px-6 text-center">
          <LockKeyhole className="h-7 w-7 text-abyss-300/70" />
          <h3 className="mt-4 font-display text-lg font-medium text-pearl">Sign in required</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">Sign in to add and manage your narrative summaries.</p>
          <button onClick={onSignIn} className="mt-5 min-h-11 rounded-lg bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400">Sign in to continue</button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {error && (
            <p className="rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-300">{error}</p>
          )}

          {showAddForm ? (
            <div className="rounded-xl border border-abyss-600/40 bg-abyss-950/35 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">New Season Summary</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                <select
                  value={newSeason}
                  onChange={(e) => setNewSeason(e.target.value)}
                  className={selectClass}
                >
                  {SEASONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  placeholder="Year (1-5)"
                  className="min-h-11 w-full rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-3 py-2 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                />
              </div>
              <p className="mt-2 text-xs text-muted">The game is designed for years 1–5, but you can go beyond.</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={adding}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-abyss-500/80 px-4 py-2 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400 disabled:opacity-50"
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Add Summary
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setError(null); }}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-abyss-600/40 px-4 py-2 text-sm text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-abyss-400/40 bg-abyss-700/30 px-4 py-2.5 text-sm font-medium text-pearl transition-all hover:border-abyss-300/60 hover:bg-abyss-600/40"
            >
              <Plus className="h-4 w-4" />
              Add New Summary
            </button>
          )}

          {loadingSummaries && summaries.length === 0 && (
            <div className="flex min-h-[6rem] items-center justify-center text-sm text-muted">Loading summaries...</div>
          )}

          {!loadingSummaries && summaries.length === 0 && (
            <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/25 px-6 text-center">
              <ScrollText className="h-6 w-6 text-abyss-300/50" />
              <p className="mt-3 text-sm text-muted">No narrative summaries yet. Tap "Add New Summary" to create one.</p>
            </div>
          )}

          {summaries.map((s) => {
            const isEditing = editingId === s.id;
            const isCollapsed = collapsed[s.id] && !isEditing;
            return (
              <div key={s.id} className="rounded-xl border border-abyss-700/30 bg-abyss-950/30">
                {isEditing ? (
                  <div className="p-4">
                    <p className="mb-2 text-sm font-medium text-pearl">{summaryTitle(s)}</p>
                    <p className="mb-3 text-xs leading-relaxed text-muted">
                      Paste each day's summary here, with the most recent day at the top.
                    </p>
                    <textarea
                      value={draftContent}
                      onChange={(e) => setDraftContent(e.target.value)}
                      placeholder="Paste your daily summaries here — newest at the top..."
                      className="min-h-[14rem] w-full resize-y rounded-lg border border-abyss-600/40 bg-abyss-950/50 p-4 font-mono text-sm leading-7 text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                      spellCheck={false}
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleSave(s.id)}
                        disabled={savingId === s.id}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-abyss-500/80 px-4 py-2 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400 disabled:opacity-50"
                      >
                        {savingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-abyss-600/40 px-4 py-2 text-sm text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 p-3">
                      <button
                        onClick={() => toggleCollapse(s.id)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-pearl"
                        aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                      >
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => toggleCollapse(s.id)}
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium text-pearl"
                      >
                        {summaryTitle(s)}
                      </button>
                      <button
                        onClick={() => handleCopy(s)}
                        disabled={!s.content}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-abyss-600/40 text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl disabled:opacity-40"
                        aria-label="Copy"
                      >
                        {copiedId === s.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Clipboard className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => startEdit(s)}
                        className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-abyss-600/40 px-3 text-xs text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-coral-400/30 bg-coral-900/20 text-coral-300 transition-all hover:border-coral-300/60 hover:bg-coral-800/40"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {!isCollapsed && (
                      <pre className="whitespace-pre-wrap border-t border-abyss-700/30 p-4 font-mono text-sm leading-7 text-muted">
                        {s.content || 'Empty — tap the edit icon to paste your summaries.'}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
