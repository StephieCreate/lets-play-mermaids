import { useEffect, useState, useCallback } from 'react';
import { UserPlus, Waves, Lock, Loader2, Play, Trash2, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { CharacterWithPlaythroughs, Playthrough } from '@/types/database';

interface CharacterRosterProps {
  onCreateCharacter: () => void;
  onResumePlaythrough: (playthroughId: string) => void;
  onSignIn: () => void;
  refreshKey: number;
}

export default function CharacterRoster({ onCreateCharacter, onResumePlaythrough, onSignIn, refreshKey }: CharacterRosterProps) {
  const { user, loading: authLoading } = useAuth();
  const [characters, setCharacters] = useState<CharacterWithPlaythroughs[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      .select('id, user_id, name, concept, traits, portrait_color, emoji, created_at, updated_at, playthroughs(id, character_id, user_id, title, apex_target, status, story_state, current_scene, turn_count, created_at, updated_at)')
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

  const handleResume = (pt: Playthrough) => {
    if (pt.status === 'completed' || pt.status === 'abandoned') return;
    onResumePlaythrough(pt.id);
  };

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
    <section id="roster" className="relative z-10 mx-auto max-w-6xl">
      <div className="mb-12 text-center">
        <div className="mb-4 flex items-center justify-center gap-3 text-abyss-300/50">
          <span className="h-px w-12 bg-gradient-to-r from-transparent to-abyss-400/30" />
          <Waves className="h-4 w-4" />
          <span className="h-px w-12 bg-gradient-to-l from-transparent to-abyss-400/30" />
        </div>
        <h2 className="font-display text-3xl font-semibold text-pearl text-glow-soft sm:text-4xl">
          Character Roster
        </h2>
        <p className="mt-3 text-sm text-muted">
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
          <button onClick={fetchCharacters} className="mt-6 rounded-lg bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400">
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
          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-muted">
              {characters.length} {characters.length === 1 ? 'mermaid' : 'mermaids'}
            </p>
            <button
              onClick={onCreateCharacter}
              className="inline-flex items-center gap-2 rounded-xl border border-abyss-400/30 bg-abyss-800/30 px-4 py-2.5 text-sm font-medium text-pearl transition-all hover:border-abyss-300/50 hover:bg-abyss-700/40"
            >
              <UserPlus className="h-4 w-4" />
              New Character
            </button>
          </div>

          <div className="space-y-2">
            {characters.map((char) => {
              const activePlaythrough = char.playthroughs?.find(
                (pt) => pt.status === 'active',
              );

              return (
                <div
                  key={char.id}
                  className="glass-panel glass-panel-hover flex items-center gap-3 rounded-xl px-4 py-3"
                >
                  <span className="text-2xl">{char.emoji || '🧜‍♀️'}</span>
                  <span className="min-w-0 flex-1 truncate font-display text-base font-medium text-pearl">
                    {char.name}
                  </span>
                  <button
                    onClick={() => (activePlaythrough ? handleResume(activePlaythrough) : onCreateCharacter())}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-abyss-500 to-abyss-400 text-pearl shadow-lg shadow-abyss-900/40 transition-all hover:from-abyss-400 hover:to-abyss-300"
                    aria-label={activePlaythrough ? 'Resume story' : 'Begin story'}
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPendingDelete(char)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-coral-400/30 bg-coral-900/20 text-coral-300 transition-all hover:border-coral-300/60 hover:bg-coral-800/40"
                    aria-label={`Delete ${char.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss-950/80 px-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-coral-900/40">
                  <AlertTriangle className="h-5 w-5 text-coral-300" />
                </div>
                <h3 className="font-display text-lg font-semibold text-pearl">Delete character?</h3>
              </div>
              <button
                onClick={() => setPendingDelete(null)}
                className="text-muted transition-colors hover:text-pearl"
                aria-label="Cancel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              Are you sure you want to delete <span className="font-medium text-pearl">{pendingDelete.emoji} {pendingDelete.name}</span>? This will permanently erase the character and all of their playthroughs and notes. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setPendingDelete(null)}
                className="flex-1 rounded-lg border border-abyss-400/30 bg-abyss-800/30 px-4 py-2.5 text-sm font-medium text-pearl transition-all hover:border-abyss-300/50 hover:bg-abyss-700/40"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-coral-600 to-coral-500 px-4 py-2.5 text-sm font-semibold text-pearl transition-all hover:from-coral-500 hover:to-coral-400 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
