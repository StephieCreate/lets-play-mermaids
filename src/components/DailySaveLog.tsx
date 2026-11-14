import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Check, Clipboard, ChevronDown, ChevronRight, Loader2, LockKeyhole, BookOpen, Archive } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import NotesPanel from '@/components/NotesPanel';
import GameConfiguration from '@/components/GameConfiguration';

interface OldSaveLog {
  id: string;
  label: string;
  content: string;
}

interface DailySaveLogProps {
  playthroughId: string;
  onSignIn: () => void;
}

export default function DailySaveLog({ playthroughId, onSignIn }: DailySaveLogProps) {
  const { user, loading: authLoading } = useAuth();
  
  // --- NEW: State toggle for the 3-part layout ---
  const [activeTab, setActiveTab] = useState<"config" | "daily" | "old">("daily");

  const [logs, setLogs] = useState<OldSaveLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!user) {
      setLogs([]);
      return;
    }
    setLoadingLogs(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('old_save_logs')
      .select('id, label, content')
      .eq('playthrough_id', playthroughId)
      .order('created_at', { ascending: false });
    if (fetchError) {
      console.error('Could not load old save logs', fetchError);
      setError('Old save logs could not be loaded.');
    } else {
      setLogs((data as OldSaveLog[]) ?? []);
    }
    setLoadingLogs(false);
  }, [user, playthroughId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleAdd = async () => {
    if (!user) {
      onSignIn();
      return;
    }
    setSavingId('new');
    setError(null);
    const { data, error: insertError } = await supabase
      .from('old_save_logs')
      .insert({ playthrough_id: playthroughId, label: '', content: '' })
      .select('id, label, content')
      .single();
    setSavingId(null);
    if (insertError || !data) {
      console.error('Could not create old save log', insertError);
      setError('Could not add a new save log. Please try again.');
      return;
    }
    const newLog = data as OldSaveLog;
    setLogs((prev) => [newLog, ...prev]);
    setEditingId(newLog.id);
    setDraftLabel('');
    setDraftContent('');
    setCollapsed((prev) => ({ ...prev, [newLog.id]: false }));
  };

  const handleSave = async (id: string) => {
    setSavingId(id);
    setError(null);
    const { error: updateError } = await supabase
      .from('old_save_logs')
      .update({ label: draftLabel, content: draftContent, updated_at: new Date().toISOString() })
      .eq('id', id);
    setSavingId(null);
    if (updateError) {
      console.error('Could not save old save log', updateError);
      setError('Your changes could not be saved.');
      return;
    }
    setLogs((prev) =>
      prev.map((l) => (l.id === id ? { ...l, label: draftLabel, content: draftContent } : l)),
    );
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    const { error: deleteError } = await supabase.from('old_save_logs').delete().eq('id', id);
    if (deleteError) {
      console.error('Could not delete old save log', deleteError);
      setError('Could not delete this save log.');
      return;
    }
    setLogs((prev) => prev.filter((l) => l.id !== id));
  };

  const handleCopy = async (log: OldSaveLog) => {
    await navigator.clipboard.writeText(log.content);
    setCopiedId(log.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const startEdit = (log: OldSaveLog) => {
    setEditingId(log.id);
    setDraftLabel(log.label);
    setDraftContent(log.content);
    setCollapsed((prev) => ({ ...prev, [log.id]: false }));
  };

  const toggleCollapse = (id: string) => {
    if (editingId === id) return;
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col w-full max-w-5xl mx-auto">
      
      {/* --- NEW: 3-Segment Tab Bar --- */}
      <div className="mb-6 grid grid-cols-3 gap-1 bg-abyss-900/50 p-1 rounded-lg border border-abyss-800/50">
        <button
          onClick={() => setActiveTab("config")}
          className={`px-2 py-2.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === "config"
              ? "bg-abyss-600/80 text-pearl shadow border border-abyss-500/50"
              : "text-muted hover:text-pearl hover:bg-abyss-800/50"
          }`}
        >
          Game Configuration
        </button>
        <button
          onClick={() => setActiveTab("daily")}
          className={`px-2 py-2.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === "daily"
              ? "bg-abyss-600/80 text-pearl shadow border border-abyss-500/50"
              : "text-muted hover:text-pearl hover:bg-abyss-800/50"
          }`}
        >
          Daily Save Log
        </button>
        <button
          onClick={() => setActiveTab("old")}
          className={`px-2 py-2.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === "old"
              ? "bg-abyss-600/80 text-pearl shadow border border-abyss-500/50"
              : "text-muted hover:text-pearl hover:bg-abyss-800/50"
          }`}
        >
          Old Save Logs
        </button>
      </div>

      {/* --- CONTENT CONTAINERS --- */}
      {/* We use CSS 'hidden' instead of removing them from the DOM so you never lose unsaved drafts when clicking around */}

      {/* 1. Game Configuration Tab */}
      <div className={activeTab === "config" ? "block" : "hidden"}>
        <GameConfiguration playthroughId={playthroughId} onSignIn={onSignIn} />
      </div>

      {/* 2. Daily Save Log Tab */}
      <div className={activeTab === "daily" ? "block" : "hidden"}>
        <NotesPanel
          playthroughId={playthroughId}
          tab="daily-save-log"
          title="Daily Save Log"
          label="Playthrough record"
          description="A running log of your daily saves and session checkpoints."
          onSignIn={onSignIn}
        />
      </div>

      {/* 3. Old Save Logs Tab */}
      <div className={activeTab === "old" ? "block" : "hidden"}>
        <section className="glass-panel min-w-0 rounded-2xl p-4 sm:p-8">
          <div className="flex items-center gap-3 border-b border-abyss-700/30 pb-5 sm:pb-6">
            <Archive className="h-5 w-5 text-abyss-300/70" />
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300/70">Archive</p>
              <h2 className="break-words font-display text-2xl font-semibold text-pearl sm:text-3xl">Old Save Logs</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Paste previous saves here so you can go back and redo anything. Each entry is collapsible and copyable.
              </p>
            </div>
          </div>

          {authLoading ? (
            <div className="mt-6 flex min-h-[8rem] items-center justify-center text-sm text-muted">Loading...</div>
          ) : !user ? (
            <div className="mt-6 flex min-h-[10rem] flex-col items-center justify-center rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/25 px-6 text-center">
              <LockKeyhole className="h-7 w-7 text-abyss-300/70" />
              <h3 className="mt-4 font-display text-lg font-medium text-pearl">Sign in required</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">Sign in to add and manage your old save logs.</p>
              <button onClick={onSignIn} className="mt-5 min-h-11 rounded-lg bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400">Sign in to continue</button>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {error && (
                <p className="rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-300">{error}</p>
              )}

              <button
                onClick={handleAdd}
                disabled={savingId === 'new'}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-abyss-400/40 bg-abyss-700/30 px-4 py-2.5 text-sm font-medium text-pearl transition-all hover:border-abyss-300/60 hover:bg-abyss-600/40 disabled:opacity-50"
              >
                {savingId === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Old Save Log
              </button>

              {loadingLogs && logs.length === 0 && (
                <div className="flex min-h-[6rem] items-center justify-center text-sm text-muted">Loading old save logs...</div>
              )}

              {!loadingLogs && logs.length === 0 && (
                <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/25 px-6 text-center">
                  <BookOpen className="h-6 w-6 text-abyss-300/50" />
                  <p className="mt-3 text-sm text-muted">No old save logs yet. Tap "Add Old Save Log" to paste one.</p>
                </div>
              )}

              {logs.map((log) => {
                const isEditing = editingId === log.id;
                const isCollapsed = collapsed[log.id] !== false && !isEditing;
                return (
                  <div key={log.id} className="rounded-xl border border-abyss-700/30 bg-abyss-950/30">
                    {isEditing ? (
                      <div className="p-4">
                        <input
                          value={draftLabel}
                          onChange={(e) => setDraftLabel(e.target.value)}
                          placeholder="Season, Day, Year (e.g. Autumn, Day 12, Year 3)"
                          className="mb-3 min-h-11 w-full rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-3 py-2 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                        />
                        <textarea
                          value={draftContent}
                          onChange={(e) => setDraftContent(e.target.value)}
                          placeholder="Paste your save log here..."
                          className="min-h-[12rem] w-full resize-y rounded-lg border border-abyss-600/40 bg-abyss-950/50 p-4 font-mono text-sm leading-7 text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                          spellCheck={false}
                        />
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => handleSave(log.id)}
                            disabled={savingId === log.id}
                            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-abyss-500/80 px-4 py-2 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400 disabled:opacity-50"
                          >
                            {savingId === log.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              if (!log.label && !log.content) {
                                handleDelete(log.id);
                              }
                            }}
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
                            onClick={() => toggleCollapse(log.id)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-pearl"
                            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                          >
                            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => toggleCollapse(log.id)}
                            className="min-w-0 flex-1 truncate text-left text-sm font-medium text-pearl"
                          >
                            {log.label || 'Untitled save log'}
                          </button>
                          <button
                            onClick={() => handleCopy(log)}
                            disabled={!log.content}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-abyss-600/40 text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl disabled:opacity-40"
                            aria-label="Copy"
                          >
                            {copiedId === log.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Clipboard className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => startEdit(log)}
                            className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-abyss-600/40 px-3 text-xs text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(log.id)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-coral-400/30 bg-coral-900/20 text-coral-300 transition-all hover:border-coral-300/60 hover:bg-coral-800/40"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {!isCollapsed && (
                          <pre className="whitespace-pre-wrap border-t border-abyss-700/30 p-4 font-mono text-sm leading-7 text-muted">
                            {log.content || 'Empty — tap Edit to paste your save log.'}
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
      </div>

    </div>
  );
}