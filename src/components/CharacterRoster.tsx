import { useEffect, useState, useCallback, type FormEvent } from 'react';
import {
  UserPlus,
  Waves,
  Lock,
  Loader2,
  Play,
  Trash2,
  AlertTriangle,
  X,
  MoreVertical,
  Pencil,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { CharacterWithPlaythroughs, Playthrough } from '@/types/database';

interface CharacterRosterProps {
  onCreateCharacter: () => void;
  onResumePlaythrough: (playthroughId: string) => void;
  onSignIn: () => void;
  refreshKey: number;
}

function getActiveApexLabel(pt?: Playthrough): string | null {
  if (!pt) return null;

  const state = pt.story_state as Record<string, unknown> | null | undefined;
  const fromState =
    (typeof state?.apex_name === 'string' && state.apex_name.trim()) ||
    (typeof state?.apexName === 'string' && state.apexName.trim()) ||
    (typeof state?.custom_apex_name === 'string' && state.custom_apex_name.trim()) ||
    '';

  const raw = fromState || (typeof pt.apex_target === 'string' ? pt.apex_target.trim() : '');
  if (!raw) return null;

  // Avoid displaying raw custom UUIDs if custom apexes use a prefix
  if (raw.startsWith('custom:') || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(raw)) {
    return 'Custom Apex';
  }

  // Format lowercase slugs like "severin" or "bull-shark" into Title Case
  if (raw === raw.toLowerCase()) {
    return raw
      .split(/[-_]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return raw;
}

export default function CharacterRoster({
  onCreateCharacter,
  onResumePlaythrough,
  onSignIn,
  refreshKey,
}: CharacterRosterProps) {
  const { user, loading: authLoading } = useAuth();
  const [characters, setCharacters] = useState<CharacterWithPlaythroughs[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [pendingRename, setPendingRename] = useState<CharacterWithPlaythroughs | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<CharacterWithPlaythroughs | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCharacters = useCallback(async () => {
    if (!user) {
      setCharacters([]);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('characters')
      .select(
        'id, user_id, name, concept, traits, portrait_color, emoji, created_at, updated_at, playthroughs(id, character_id, user_id, title, apex_target, status, story_state, current_scene, turn_count, created_at, updated_at)',
      )
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Could not load characters', fetchError);
      setError('Your characters could not be loaded. Please try again.');
    } else {
      setCharacters((data as CharacterWithPlaythroughs[]) ?? []);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters, refreshKey]);

  // Close open ⋮ menu on outside click or Escape key
  useEffect(() => {
    if (!openMenuId) return;

    const handleClose = () => setOpenMenuId(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };

    document.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuId]);

  const handleResume = (pt: Playthrough) => {
    if (pt.status === 'completed' || pt.status === 'abandoned') return;
    onResumePlaythrough(pt.id);
  };

  const openRenameModal = (char: CharacterWithPlaythroughs) => {
    setOpenMenuId(null);
    setPendingRename(char);
    setRenameValue(char.name);
    setRenameError(null);
  };

  const handleConfirmRename = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!pendingRename) return;

      const trimmed = renameValue.trim();
      if (!trimmed) {
        setRenameError('Please enter a name for your mermaid.');
        return;
      }

      if (trimmed === pendingRename.name) {
        setPendingRename(null);
        return;
      }

      setRenaming(true);
      setRenameError(null);

      const { error: updateError } = await supabase
        .from('characters')
        .update({ name: trimmed })
        .eq('id', pendingRename.id);

      setRenaming(false);

      if (updateError) {
        console.error('Could not rename character', updateError);
        setRenameError('Could not save the new name. Please try again.');
      } else {
        setCharacters((prev) =>
          prev.map((c) => (c.id === pendingRename.id ? { ...c, name: trimmed } : c)),
        );
        setPendingRename(null);
      }
    },
    [pendingRename, renameValue],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error: deleteError } = await supabase
      .from('characters')
      .delete()
      .eq('id', pendingDelete.id);
    setDeleting(false);
    if (deleteError) {
      console.error('Could not delete character', deleteError);
      setError('Could not delete this character. Please try again.');
    } else {
      setCharacters((prev) => prev.filter((c) => c.id !== pendingDelete.id));
    }
    setPendingDelete(null);
  }, [pendingDelete]);

  return (
    <section id="roster" className="relative z-10 mx-auto max-w-3xl">
      <div className="mb-8 text-center sm:mb-10">
        <div className="mb-3 flex items-center justify-center gap-3 text-abyss-300/50">
          <span className="h-px w-12 bg-gradient-to-r from-transparent to-abyss-400/30" />
          <Waves className="h-4 w-4" />
          <span className="h-px w-12 bg-gradient-to-l from-transparent to-abyss-400/30" />
        </div>
        <h2 className="font-display text-3xl font-semibold text-pearl text-glow-soft sm:text-4xl">
          Character Roster
        </h2>
        <p className="mt-2.5 text-sm text-muted">
          Your mermaids await. Each one carries a story shaped by your choices.
        </p>
      </div>

      {authLoading || loading ? (
        <div className="glass-panel rounded-2xl p-16 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-abyss-300/60" />
          <p className="mt-4 text-sm text-muted">Loading your mermaids...</p>
        </div>
      ) : error ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <p className="text-sm text-coral-300">{error}</p>
          <button
            onClick={fetchCharacters}
            className="mt-6 rounded-lg bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400"
          >
            Try Again
          </button>
        </div>
      ) : !user ? (
        <div className="glass-panel rounded-2xl p-12 text-center sm:p-16">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-abyss-800/50">
            <Lock className="h-8 w-8 text-abyss-300/50" />
          </div>
          <h3 className="font-display text-xl font-medium text-pearl sm:text-2xl">
            Sign in to view your roster
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            Your characters are saved to your account and travel with you across every device.
          </p>
          <button
            onClick={onSignIn}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-6 py-3 text-sm font-semibold text-pearl shadow-lg shadow-abyss-900/50 transition-all hover:from-abyss-400 hover:to-abyss-300 hover:text-glow"
          >
            Sign In
          </button>
        </div>
      ) : characters.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center sm:p-16">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-abyss-800/50">
            <Waves className="h-8 w-8 text-abyss-300/50" />
          </div>
          <h3 className="font-display text-xl font-medium text-pearl sm:text-2xl">
            No characters yet
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            Create your first mermaid and begin your journey through the dark ocean.
          </p>
          <button
            onClick={onCreateCharacter}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-6 py-3 text-sm font-semibold text-pearl shadow-lg shadow-abyss-900/50 transition-all hover:from-abyss-400 hover:to-abyss-300 hover:text-glow"
          >
            <UserPlus className="h-4 w-4" />
            Create Your First Character
          </button>
        </div>
      ) : (
        <>
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm text-muted">
              {characters.length} {characters.length === 1 ? 'mermaid' : 'mermaids'}
            </p>
            <button
              onClick={onCreateCharacter}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-abyss-400/30 bg-abyss-800/35 px-4 py-2 text-sm font-medium text-pearl transition-all hover:border-abyss-300/50 hover:bg-abyss-700/45"
            >
              <UserPlus className="h-4 w-4" />
              New Character
            </button>
          </div>

          <div className="space-y-2.5">
            {characters.map((char) => {
              const activePlaythrough = char.playthroughs?.find(
                (pt) => pt.status === 'active',
              );
              const apexLabel = getActiveApexLabel(activePlaythrough);
              const isMenuOpen = openMenuId === char.id;

              const launchCharacter = () => {
                if (activePlaythrough) {
                  handleResume(activePlaythrough);
                } else {
                  onCreateCharacter();
                }
              };

              return (
                <div
                  key={char.id}
                  role="button"
                  tabIndex={0}
                  onClick={launchCharacter}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      launchCharacter();
                    }
                  }}
                  aria-label={
                    activePlaythrough
                      ? `Resume story as ${char.name}`
                      : `Begin story as ${char.name}`
                  }
                  className={`glass-panel group relative flex cursor-pointer items-center gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all active:scale-[0.995] ${
                    isMenuOpen ? 'z-30 border-abyss-400/45' : 'z-10 glass-panel-hover'
                  }`}
                >
                  <span className="shrink-0 text-2xl leading-none">{char.emoji || '🧜‍♀️'}</span>

                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-lg font-medium leading-snug text-pearl">
                      {char.name}
                    </div>
                    {apexLabel && (
                      <div className="mt-0.5 truncate text-xs font-normal text-abyss-200/70">
                        {apexLabel}
                      </div>
                    )}
                  </div>

                  {/* Visual Play cue (whole card launches) */}
                  <span
                    aria-hidden="true"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 text-pearl shadow-md shadow-abyss-950/50 transition-all group-hover:from-abyss-400 group-hover:to-abyss-300"
                  >
                    <Play className="ml-0.5 h-4 w-4" />
                  </span>

                  {/* Isolated ⋮ Overflow Menu */}
                  <div
                    className="relative shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(isMenuOpen ? null : char.id)}
                      className={`inline-flex h-10 w-9 items-center justify-center rounded-xl border transition-colors ${
                        isMenuOpen
                          ? 'border-abyss-400/40 bg-abyss-700/50 text-pearl'
                          : 'border-transparent text-muted/80 hover:border-abyss-500/30 hover:bg-abyss-800/50 hover:text-pearl'
                      }`}
                      aria-label={`More options for ${char.name}`}
                      aria-expanded={isMenuOpen}
                      aria-haspopup="menu"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {isMenuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 top-12 z-40 w-44 overflow-hidden rounded-xl border border-abyss-400/30 bg-abyss-950/95 p-1.5 shadow-xl shadow-abyss-950/80 backdrop-blur-xl"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => openRenameModal(char)}
                          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-pearl transition-colors hover:bg-abyss-800/70"
                        >
                          <Pencil className="h-4 w-4 text-abyss-200" />
                          <span>Rename</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenMenuId(null);
                            setPendingDelete(char);
                          }}
                          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-coral-300 transition-colors hover:bg-coral-900/30"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Rename Character Modal */}
      {pendingRename && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-abyss-950/80 px-4 backdrop-blur-sm"
          onClick={() => !renaming && setPendingRename(null)}
        >
          <div
            className="glass-panel w-full max-w-md rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-abyss-800/70 text-xl">
                  {pendingRename.emoji || '🧜‍♀️'}
                </div>
                <h3 className="font-display text-lg font-semibold text-pearl">
                  Rename Character
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingRename(null)}
                disabled={renaming}
                className="text-muted transition-colors hover:text-pearl"
                aria-label="Cancel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRename} className="space-y-4">
              <div>
                <label
                  htmlFor="rename-character-input"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-abyss-200/80"
                >
                  Character Name
                </label>
                <input
                  id="rename-character-input"
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={60}
                  autoFocus
                  className="w-full rounded-xl border border-abyss-500/40 bg-abyss-950/70 px-3.5 py-2.5 text-sm text-pearl placeholder-muted/50 focus:border-abyss-300/60 focus:outline-none"
                  placeholder="Enter mermaid name..."
                />
                {renameError && (
                  <p className="mt-2 text-xs text-coral-300">{renameError}</p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingRename(null)}
                  disabled={renaming}
                  className="flex-1 rounded-xl border border-abyss-400/30 bg-abyss-800/30 px-4 py-2.5 text-sm font-medium text-pearl transition-all hover:border-abyss-300/50 hover:bg-abyss-700/40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renaming || !renameValue.trim()}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-4 py-2.5 text-sm font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300 disabled:opacity-50"
                >
                  {renaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Pencil className="h-4 w-4" />
                  )}
                  Save Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-abyss-950/80 px-4 backdrop-blur-sm"
          onClick={() => !deleting && setPendingDelete(null)}
        >
          <div
            className="glass-panel w-full max-w-md rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-coral-900/40">
                  <AlertTriangle className="h-5 w-5 text-coral-300" />
                </div>
                <h3 className="font-display text-lg font-semibold text-pearl">
                  Delete character?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="text-muted transition-colors hover:text-pearl"
                aria-label="Cancel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              Are you sure you want to delete{' '}
              <span className="font-medium text-pearl">
                {pendingDelete.emoji} {pendingDelete.name}
              </span>
              ? This will permanently erase the character and all of their playthroughs and notes.
              This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-abyss-400/30 bg-abyss-800/30 px-4 py-2.5 text-sm font-medium text-pearl transition-all hover:border-abyss-300/50 hover:bg-abyss-700/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-coral-600 to-coral-500 px-4 py-2.5 text-sm font-semibold text-pearl transition-all hover:from-coral-500 hover:to-coral-400 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}