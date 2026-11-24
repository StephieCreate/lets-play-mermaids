import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Trash2, Check, ChevronDown, ChevronRight, Loader2,
  LockKeyhole, Box, Edit3, Power, X, Music,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

interface ExtrasPanelProps {
  playthroughId: string;
  onSignIn: () => void;
}

interface ExtraContent {
  id: string;
  title: string;
  content: string;
  category: string;
  is_active: boolean;
}

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'custom-mechanic', label: 'Custom Mechanic' },
  { value: 'homebrew-item', label: 'Homebrew Item' },
  { value: 'npc-detail', label: 'NPC Detail' },
  { value: 'location-detail', label: 'Location Detail' },
  { value: 'lore', label: 'Lore' },
  { value: 'songs', label: 'Songs & Chants' },
  { value: 'reference', label: 'Reference' },
  { value: 'temporary', label: 'Temporary Content' },
] as const;

function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export default function ExtrasPanel({ playthroughId, onSignIn }: ExtrasPanelProps) {
  const { user, loading: authLoading } = useAuth();
  const [extras, setExtras] = useState<ExtraContent[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExtraContent | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<string>('general');
  const [newContent, setNewContent] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchExtras = useCallback(async () => {
    if (!user) {
      setExtras([]);
      return;
    }
    setLoadingExtras(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('extra_contents')
      .select('id, title, content, category, is_active')
      .eq('playthrough_id', playthroughId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Could not load extras', fetchError);
      setError('Extras could not be loaded.');
    } else {
      setExtras((data as ExtraContent[]) ?? []);
    }
    setLoadingExtras(false);
  }, [user, playthroughId]);

  useEffect(() => {
    fetchExtras();
  }, [fetchExtras]);

  const handleAdd = async () => {
    if (!newTitle.trim()) {
      setError('Please give your extra content a title.');
      return;
    }
    setAdding(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('extra_contents')
      .insert({
        playthrough_id: playthroughId,
        title: newTitle.trim(),
        content: newContent,
        category: newCategory,
        is_active: true,
      })
      .select('id, title, content, category, is_active')
      .single();

    setAdding(false);
    if (insertError || !data) {
      console.error('Could not create extra content', insertError);
      setError('Could not add this extra. Please try again.');
      return;
    }

    const created = data as ExtraContent;
    setExtras((prev) => [created, ...prev]);
    setShowAddForm(false);
    setNewTitle('');
    setNewCategory('general');
    setNewContent('');
  };

  const handleSave = async (id: string) => {
    if (!draft) return;
    setSavingId(id);
    setError(null);
    const { error: updateError } = await supabase
      .from('extra_contents')
      .update({
        title: draft.title,
        content: draft.content,
        category: draft.category,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    setSavingId(null);
    if (updateError) {
      console.error('Could not save extra content', updateError);
      setError('Your changes could not be saved.');
      return;
    }
    setExtras((prev) =>
      prev.map((e) => (e.id === id ? { ...e, title: draft.title, content: draft.content, category: draft.category } : e)),
    );
    setEditingId(null);
    setDraft(null);
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    const next = !current;
    setExtras((prev) => prev.map((e) => (e.id === id ? { ...e, is_active: next } : e)));
    const { error: toggleError } = await supabase
      .from('extra_contents')
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (toggleError) {
      console.error('Could not toggle extra', toggleError);
      setExtras((prev) => prev.map((e) => (e.id === id ? { ...e, is_active: current } : e)));
      setError('Could not update this extra.');
    }
  };

  const handleDelete = async (id: string) => {
    const { error: deleteError } = await supabase.from('extra_contents').delete().eq('id', id);
    if (deleteError) {
      console.error('Could not delete extra', deleteError);
      setError('Could not delete this extra.');
      return;
    }
    setExtras((prev) => prev.filter((e) => e.id !== id));
  };

  const startEdit = (e: ExtraContent) => {
    setEditingId(e.id);
    setDraft({ ...e });
    setCollapsed((prev) => ({ ...prev, [e.id]: false }));
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
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300/70">Additional material</p>
          <h2 className="break-words font-display text-2xl font-semibold text-pearl sm:text-3xl">Extras</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Customize your game without touching the rules. Add custom mechanics, homebrew items, NPC details, lore, and more.
            Toggle an entry off to exclude it from the narrator without deleting it.
          </p>
        </div>
      </div>

      {authLoading ? (
        <div className="mt-6 flex min-h-[8rem] items-center justify-center text-sm text-muted">Loading...</div>
      ) : !user ? (
        <div className="mt-6 flex min-h-[10rem] flex-col items-center justify-center rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/25 px-6 text-center">
          <LockKeyhole className="h-7 w-7 text-abyss-300/70" />
          <h3 className="mt-4 font-display text-lg font-medium text-pearl">Sign in required</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">Sign in to add and manage your extra content.</p>
          <button onClick={onSignIn} className="mt-5 min-h-11 rounded-lg bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400">Sign in to continue</button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {error && (
            <p className="rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-300">{error}</p>
          )}

          {showAddForm ? (
            <div className="rounded-xl border border-abyss-600/40 bg-abyss-950/35 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">New Extra Content</p>
                <button
                  onClick={() => { setShowAddForm(false); setError(null); }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-pearl"
                  aria-label="Cancel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-3">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Title (e.g. 'Tide Gem Mechanics')"
                  className="min-h-11 w-full rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-3 py-2 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className={selectClass}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Type or paste your extra content here..."
                  className="min-h-[12rem] w-full resize-y rounded-lg border border-abyss-600/40 bg-abyss-950/50 p-4 text-sm leading-relaxed text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                  spellCheck={false}
                />
                <button
                  onClick={handleAdd}
                  disabled={adding}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-abyss-500/80 px-4 py-2 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400 disabled:opacity-50"
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Add Extra
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-abyss-400/40 bg-abyss-700/30 px-4 py-2.5 text-sm font-medium text-pearl transition-all hover:border-abyss-300/60 hover:bg-abyss-600/40"
            >
              <Plus className="h-4 w-4" />
              Add New Extra Content
            </button>
          )}

          {loadingExtras && extras.length === 0 && (
            <div className="flex min-h-[6rem] items-center justify-center text-sm text-muted">Loading extras...</div>
          )}

          {!loadingExtras && extras.length === 0 && (
            <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/25 px-6 text-center">
              <Box className="h-6 w-6 text-abyss-300/50" />
              <p className="mt-3 text-sm text-muted">No extra content yet. Tap "Add New Extra Content" to create one.</p>
            </div>
          )}

          {extras.map((e) => {
            const isEditing = editingId === e.id;
            const isCollapsed = collapsed[e.id] && !isEditing;
            return (
              <div
                key={e.id}
                className={`rounded-xl border bg-abyss-950/30 transition-opacity ${
                  e.is_active ? 'border-abyss-700/30' : 'border-abyss-700/20 opacity-60'
                }`}
              >
                {isEditing && draft ? (
                  <div className="p-4">
                    <div className="grid gap-3">
                      <input
                        value={draft.title}
                        onChange={(ev) => setDraft({ ...draft, title: ev.target.value })}
                        placeholder="Title"
                        className="min-h-11 w-full rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-3 py-2 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                      />
                      <select
                        value={draft.category}
                        onChange={(ev) => setDraft({ ...draft, category: ev.target.value })}
                        className={selectClass}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <textarea
                        value={draft.content}
                        onChange={(ev) => setDraft({ ...draft, content: ev.target.value })}
                        placeholder="Type or paste your extra content here..."
                        className="min-h-[12rem] w-full resize-y rounded-lg border border-abyss-600/40 bg-abyss-950/50 p-4 text-sm leading-relaxed text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                        spellCheck={false}
                      />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleSave(e.id)}
                        disabled={savingId === e.id}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-abyss-500/80 px-4 py-2 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400 disabled:opacity-50"
                      >
                        {savingId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setDraft(null); }}
                        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-abyss-600/40 px-4 py-2 text-sm text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 p-3">
                      <button
                        onClick={() => toggleCollapse(e.id)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-pearl"
                        aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                      >
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => toggleCollapse(e.id)}
                        className="min-w-0 flex-1 truncate text-left"
                      >
                        <span className="block truncate text-sm font-medium text-pearl">{e.title}</span>
                        {e.category === 'songs' ? (
                          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-abyss-400/40 bg-abyss-700/40 px-2 py-0.5 text-xs font-medium text-abyss-200">
                            <Music className="h-3 w-3" />
                            Songs & Chants
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-xs text-muted/70">{categoryLabel(e.category)}</span>
                        )}
                      </button>
                      <button
                        onClick={() => handleToggleActive(e.id, e.is_active)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                          e.is_active ? 'bg-abyss-500/80' : 'bg-abyss-700/50'
                        }`}
                        role="switch"
                        aria-checked={e.is_active}
                        aria-label="Toggle active"
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-pearl shadow transition-transform ${
                            e.is_active ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => startEdit(e)}
                        className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-abyss-600/40 px-3 text-xs text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl"
                        aria-label="Edit"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-coral-400/30 bg-coral-900/20 text-coral-300 transition-all hover:border-coral-300/60 hover:bg-coral-800/40"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {!isCollapsed && (
                      <pre className="whitespace-pre-wrap border-t border-abyss-700/30 p-4 text-sm leading-relaxed text-muted">
                        {e.content || 'Empty — tap the edit icon to add content.'}
                      </pre>
                    )}
                    {!isCollapsed && !e.is_active && (
                      <div className="flex items-center gap-2 border-t border-abyss-700/20 px-4 py-2 text-xs text-muted/60">
                        <Power className="h-3.5 w-3.5" />
                        Inactive — excluded from the narrator's prompt
                      </div>
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
