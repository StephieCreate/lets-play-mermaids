import { useCallback, useEffect, useState } from 'react';
import { PenLine, Plus, Pencil, Trash2, Loader2, LockKeyhole, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { listCustomApexes } from '@/lib/customApexes';
import type { UserCustomApex } from '@/types/database';
import CustomApexEditorModal from '@/components/CustomApexEditorModal';

interface CustomApexPanelProps {
  onSignIn: () => void;
}

export default function CustomApexPanel({ onSignIn }: CustomApexPanelProps) {
  const { user } = useAuth();
  const [apexes, setApexes] = useState<UserCustomApex[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<UserCustomApex | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await listCustomApexes();
    setApexes(data);
    setLoadError(error);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) refresh();
    else setApexes([]);
  }, [user, refresh]);

  const handleSaved = (saved: UserCustomApex) => {
    setApexes((prev) => {
      const exists = prev.some((a) => a.id === saved.id);
      return exists
        ? prev.map((a) => (a.id === saved.id ? saved : a))
        : [saved, ...prev];
    });
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    const { error } = await supabase.from('user_custom_apexes').delete().eq('id', id);
    setDeletingId(null);
    setConfirmingId(null);
    if (error) {
      console.error('Failed to delete custom apex', error);
      setDeleteError('That Apex could not be deleted. Please try again.');
      return;
    }
    setApexes((prev) => prev.filter((a) => a.id !== id));
  };

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (apex: UserCustomApex) => {
    setEditing(apex);
    setEditorOpen(true);
  };

  if (!user) {
    return (
      <div className="glass-panel mx-auto max-w-2xl rounded-2xl p-8 text-center">
        <LockKeyhole className="mx-auto mb-4 h-8 w-8 text-abyss-300/60" />
        <h2 className="font-display text-2xl font-semibold text-pearl">Sign in to build Custom Apexes</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
          Your custom Apexes are saved to your account so they are available every time you start a story.
        </p>
        <button
          onClick={onSignIn}
          className="mt-6 min-h-11 rounded-lg bg-gradient-to-r from-abyss-500 to-abyss-400 px-5 py-2 text-sm font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-abyss-300/70">
            <PenLine className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.24em]">Mod Workshop</span>
          </div>
         <h2 className="font-display text-3xl font-semibold text-pearl text-glow-soft">Custom Apex</h2>
          
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Write your own Apex in Markdown. Custom Apexes appear in the character creation list next to the official ones.
          </p>
          
          <p className="mt-3 max-w-xl text-xs italic leading-relaxed text-muted/80">
            A note from the developer: I absolutely love modding my own games, and I wanted to give you that exact same freedom. Use this space to build your ultimate deep-ocean romance. Once you've built your Apex, come share their markdown files on our official Discord! I love playing your creations, and standout community Apexes might just get a chance to become official additions to the game!
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-abyss-500 to-abyss-400 px-5 py-2 text-sm font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300"
        >
          <Plus className="h-4 w-4" />
          Create New Custom Apex
        </button>
      </div>

      {loadError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-coral-500/40 bg-coral-900/30 px-4 py-3 text-sm text-coral-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {deleteError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-coral-500/40 bg-coral-900/30 px-4 py-3 text-sm text-coral-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{deleteError}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your Apexes...
        </div>
      ) : apexes.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <p className="text-sm leading-relaxed text-muted">
            You have not written any custom Apexes yet. Create one to start a story with your own mate.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {apexes.map((apex) => {
            const confirming = confirmingId === apex.id;
            const deleting = deletingId === apex.id;
            return (
              <li
                key={apex.id}
                className="glass-panel flex flex-col gap-4 rounded-2xl p-5 transition-colors hover:border-abyss-400/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold text-pearl">{apex.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{apex.content}</p>
                </div>

                {confirming ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm text-muted">Delete this Apex?</span>
                    <button
                      onClick={() => handleDelete(apex.id)}
                      disabled={deleting}
                      className="flex min-h-11 items-center gap-2 rounded-lg border border-coral-500/50 bg-coral-900/40 px-3 py-2 text-sm font-medium text-coral-200 transition-colors hover:bg-coral-800/50 disabled:opacity-50"
                    >
                      {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      disabled={deleting}
                      className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-pearl disabled:opacity-50"
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => openEdit(apex)}
                      className="flex min-h-11 items-center gap-2 rounded-lg border border-abyss-600/40 px-3 py-2 text-sm font-medium text-pearl transition-colors hover:bg-abyss-800/50"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => { setDeleteError(null); setConfirmingId(apex.id); }}
                      className="flex min-h-11 items-center gap-2 rounded-lg border border-abyss-600/40 px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-coral-500/40 hover:text-coral-200"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CustomApexEditorModal
        open={editorOpen}
        apex={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
