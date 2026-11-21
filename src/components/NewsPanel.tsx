import { useState } from 'react';
import { AlertCircle, Check, Loader2, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export interface NewsPost {
  id: string;
  slug: string | null;
  phase: string;
  title: string;
  content: string;
  created_at: string;
  created_by: string | null;
}

interface NewsPanelProps {
  posts: NewsPost[];
  loading: boolean;
  error: string | null;
  readNewsIds: string[];
  isAdmin: boolean;
  user: User | null;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onPostsChanged: () => void;
}

interface PostDraft {
  phase: string;
  title: string;
  content: string;
}

const emptyDraft: PostDraft = { phase: '', title: '', content: '' };

export default function NewsPanel({
  posts,
  loading,
  error,
  readNewsIds,
  isAdmin,
  user,
  onMarkRead,
  onMarkAllRead,
  onPostsChanged,
}: NewsPanelProps) {
  const hasUnread = posts.some((post) => !readNewsIds.includes(post.id));
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PostDraft>(emptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const openCreateForm = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (post: NewsPost) => {
    setEditingId(post.id);
    setDraft({ phase: post.phase, title: post.title, content: post.content });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setFormError(null);
  };

  const canSubmit = draft.phase.trim().length > 0 && draft.title.trim().length > 0 && draft.content.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !user || submitting) return;
    setSubmitting(true);
    setFormError(null);

    const payload = {
      phase: draft.phase.trim(),
      title: draft.title.trim(),
      content: draft.content.trim(),
    };

    const result = editingId
      ? await supabase.from('news_posts').update(payload).eq('id', editingId)
      : await supabase.from('news_posts').insert({ ...payload, created_by: user.id });

    setSubmitting(false);

    if (result.error) {
      console.error('Failed to save news post', result.error);
      setFormError('The post could not be saved. Please try again.');
      return;
    }

    closeForm();
    onPostsChanged();
  };

  const handleDelete = async (id: string) => {
    const { error: deleteError } = await supabase.from('news_posts').delete().eq('id', id);
    setDeleteConfirmId(null);
    if (deleteError) {
      console.error('Failed to delete news post', deleteError);
      return;
    }
    onPostsChanged();
  };

  return (
    <section className="mx-auto max-w-3xl space-y-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300">
            <Sparkles className="h-4 w-4 text-foam-400" />
            <span>Alpha / Beta Phase Log</span>
          </div>
          <h2 className="font-display text-3xl font-bold text-pearl sm:text-4xl">
            News &amp; Updates
          </h2>
        </div>

        {hasUnread && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-abyss-400/35 bg-abyss-500/25 px-3.5 py-2 text-xs font-medium text-pearl transition-all hover:bg-abyss-500/40"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Mark All as Read</span>
          </button>
        )}
      </div>

      {isAdmin && !formOpen && (
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-foam-400/35 bg-foam-500/15 px-3.5 py-2 text-xs font-semibold text-foam-200 transition-all hover:bg-foam-500/25"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add New News Post</span>
        </button>
      )}

      {isAdmin && formOpen && (
        <div className="glass-panel rounded-2xl border-foam-400/25 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-pearl">
              {editingId ? 'Edit News Post' : 'New News Post'}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-abyss-700/40 hover:text-pearl"
              aria-label="Close form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={draft.phase}
              onChange={(e) => setDraft((d) => ({ ...d, phase: e.target.value }))}
              placeholder="Phase (e.g., Phase 7)"
              className="w-full rounded-xl border border-abyss-400/30 bg-abyss-900/60 px-3.5 py-2.5 text-sm text-pearl placeholder:text-muted focus:border-foam-400/50 focus:outline-none"
            />
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Title"
              className="w-full rounded-xl border border-abyss-400/30 bg-abyss-900/60 px-3.5 py-2.5 text-sm text-pearl placeholder:text-muted focus:border-foam-400/50 focus:outline-none"
            />
            <textarea
              value={draft.content}
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
              placeholder="What's new in the deep?"
              rows={5}
              className="w-full resize-y rounded-xl border border-abyss-400/30 bg-abyss-900/60 px-3.5 py-2.5 text-sm leading-relaxed text-pearl placeholder:text-muted focus:border-foam-400/50 focus:outline-none"
            />

            {formError && (
              <p className="text-xs font-medium text-coral-300">{formError}</p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-foam-500/25 px-4 py-2 text-xs font-semibold text-foam-100 transition-all hover:bg-foam-500/35 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{editingId ? 'Save Changes' : 'Publish Post'}</span>
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="inline-flex min-h-10 items-center rounded-xl border border-abyss-400/30 px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-abyss-700/40 hover:text-pearl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="glass-panel flex items-center justify-center gap-3 rounded-2xl p-8 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          Surfacing the latest updates...
        </div>
      )}

      {!loading && error && (
        <div className="glass-panel flex items-center gap-3 rounded-2xl border-coral-500/30 p-6 text-sm text-coral-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted">
          No news posts yet. The deep is quiet... for now.
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-4">
          {posts.map((post) => {
            const isUnread = !readNewsIds.includes(post.id);
            return (
              <article
                key={post.id}
                className={`glass-panel rounded-2xl p-5 transition-all sm:p-6 ${
                  isUnread ? 'border-coral-500/40' : ''
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-abyss-400/30 bg-abyss-800/60 px-2.5 py-0.5 font-mono text-[11px] text-abyss-200">
                      {post.phase}
                    </span>
                    {isUnread && (
                      <span className="rounded-full bg-coral-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-coral-300 ring-1 ring-coral-500/40">
                        New
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isUnread && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(post.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-abyss-400/30 bg-abyss-700/30 px-2.5 py-1 text-xs font-medium text-pearl transition-colors hover:bg-abyss-600/40"
                      >
                        <Check className="h-3 w-3" />
                        <span>Read</span>
                      </button>
                    )}

                    {isAdmin && deleteConfirmId !== post.id && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditForm(post)}
                          className="inline-flex items-center gap-1 rounded-lg border border-abyss-400/30 bg-abyss-700/30 px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-abyss-600/40 hover:text-pearl"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(post.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-coral-500/30 bg-coral-500/10 px-2.5 py-1 text-xs font-medium text-coral-300 transition-colors hover:bg-coral-500/20"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </button>
                      </>
                    )}

                    {isAdmin && deleteConfirmId === post.id && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-coral-300">Delete?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(post.id)}
                          className="rounded-lg bg-coral-500/25 px-2.5 py-1 text-xs font-semibold text-coral-200 transition-colors hover:bg-coral-500/40"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="rounded-lg border border-abyss-400/30 px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-abyss-700/40 hover:text-pearl"
                        >
                          No
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="font-display text-lg font-semibold text-pearl sm:text-xl">
                  {post.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {post.content}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
