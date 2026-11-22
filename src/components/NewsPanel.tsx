import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Bold,
  Check,
  Eye,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Pencil,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { NewsPost } from '@/types/database';

export type { NewsPost };

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
  author_name: string;
}

const emptyDraft: PostDraft = { phase: '', title: '', content: '', author_name: 'Torva' };

const AUTHOR_OPTIONS = ['Torva', 'Stephana'] as const;

/* ------------------------------------------------------------------ */
/* Sanitized Markdown rendering (no dangerouslySetInnerHTML anywhere — */
/* every token becomes a React node, so content can never inject HTML) */
/* ------------------------------------------------------------------ */

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
const BOLD_RE = /\*\*(.+?)\*\*/;
const ITALIC_RE = /(?<!\*)\*([^*\n]+)\*(?!\*)/;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let key = 0;

  while (rest.length > 0) {
    const link = LINK_RE.exec(rest);
    const bold = BOLD_RE.exec(rest);
    const italic = ITALIC_RE.exec(rest);

    const candidates = [
      link && { kind: 'link' as const, index: link.index, match: link },
      bold && { kind: 'bold' as const, index: bold.index, match: bold },
      italic && { kind: 'italic' as const, index: italic.index, match: italic },
    ].filter((c): c is { kind: 'link' | 'bold' | 'italic'; index: number; match: RegExpExecArray } => Boolean(c));

    if (candidates.length === 0) {
      nodes.push(<span key={`t${key++}`}>{rest}</span>);
      break;
    }

    candidates.sort((a, b) => a.index - b.index);
    const first = candidates[0];

    if (first.index > 0) {
      nodes.push(<span key={`t${key++}`}>{rest.slice(0, first.index)}</span>);
    }

    if (first.kind === 'link') {
      nodes.push(
        <a
          key={`a${key++}`}
          href={first.match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foam-300 underline decoration-foam-400/40 underline-offset-2 transition-colors hover:text-foam-200 hover:decoration-foam-300"
        >
          {first.match[1]}
        </a>,
      );
    } else if (first.kind === 'bold') {
      nodes.push(
        <strong key={`b${key++}`} className="font-semibold text-pearl">
          {renderInline(first.match[1])}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={`i${key++}`} className="italic text-pearl/95">
          {renderInline(first.match[1])}
        </em>,
      );
    }

    rest = rest.slice(first.index + first.match[0].length);
  }

  return nodes;
}

type Block =
  | { type: 'p'; lines: string[]; key: string }
  | { type: 'ul'; items: string[]; key: string }
  | { type: 'ol'; items: string[]; key: string }
  | { type: 'h'; level: number; text: string; key: string };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const match = trimmed.match(/^(#{1,3})\s+(.*)$/);
      if (match) {
        blocks.push({ type: 'h', level: match[1].length, text: match[2], key: `h${key++}` });
        i++;
        continue;
      }
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].trim().match(/^[-*+]\s+(.*)$/);
        if (!itemMatch) break;
        items.push(itemMatch[1]);
        i++;
      }
      blocks.push({ type: 'ul', items, key: `ul${key++}` });
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].trim().match(/^\d+[.)]\s+(.*)$/);
        if (!itemMatch) break;
        items.push(itemMatch[1]);
        i++;
      }
      blocks.push({ type: 'ol', items, key: `ol${key++}` });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const lt = lines[i].trim();
      if (lt === '' || /^[-*+]\s+/.test(lt) || /^\d+[.)]\s+/.test(lt) || /^#{1,3}\s+/.test(lt)) break;
      paraLines.push(lt);
      i++;
    }
    blocks.push({ type: 'p', lines: paraLines, key: `p${key++}` });
  }

  return blocks;
}

export function NewsMarkdownBody({ content }: { content: string }) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className="space-y-1">
      {blocks.map((block) => {
        if (block.type === 'h') {
          const sizes = ['text-xl', 'text-lg', 'text-base'];
          return (
            <p
              key={block.key}
              className={`font-display font-semibold text-pearl ${sizes[block.level - 1]} mt-3 mb-1`}
            >
              {renderInline(block.text)}
            </p>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={block.key} className="my-2 list-disc space-y-1 pl-5 text-pearl/90">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={block.key} className="my-2 list-decimal space-y-1 pl-5 text-pearl/90">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={block.key} className="my-2 text-pearl/90">
            {block.lines.map((line, li) => (
              <span key={li}>
                {renderInline(line)}
                {li < block.lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

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
  const [formMode, setFormMode] = useState<'write' | 'preview'>('write');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const openCreateForm = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setFormError(null);
    setFormMode('write');
    setFormOpen(true);
  };

  const openEditForm = (post: NewsPost) => {
    setEditingId(post.id);
    setDraft({
      phase: post.phase,
      title: post.title,
      content: post.content,
      author_name: post.author_name ?? AUTHOR_OPTIONS[0],
    });
    setFormError(null);
    setFormMode('write');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setFormError(null);
    setFormMode('write');
  };

  const canSubmit =
    draft.phase.trim().length > 0 && draft.title.trim().length > 0 && draft.content.trim().length > 0;

  // Wrap the highlighted text (or drop a placeholder at the cursor) and keep focus
  const wrapSelection = (before: string, after: string, placeholder: string, selectInside = true) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const selected = value.slice(selectionStart, selectionEnd) || placeholder;
    const next = value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
    setDraft((d) => ({ ...d, content: next }));
    requestAnimationFrame(() => {
      textarea.focus();
      if (selectInside) {
        textarea.setSelectionRange(
          selectionStart + before.length,
          selectionStart + before.length + selected.length,
        );
      } else {
        const caret = selectionStart + before.length + selected.length + after.length;
        textarea.setSelectionRange(caret, caret);
      }
    });
  };

  // Prefix each selected line (bullet / numbered list)
  const prefixSelection = (prefix: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const segment = value.slice(lineStart, selectionEnd) || 'item';
    const prefixed = segment
      .split('\n')
      .map((line) => (line.trim().startsWith(prefix.trim()) ? line : prefix + line))
      .join('\n');
    const next = value.slice(0, lineStart) + prefixed + value.slice(selectionEnd);
    setDraft((d) => ({ ...d, content: next }));
    requestAnimationFrame(() => {
      textarea.focus();
      const caret = lineStart + prefixed.length;
      textarea.setSelectionRange(caret, caret);
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit || !user || submitting) return;
    setSubmitting(true);
    setFormError(null);

    const payload = {
      phase: draft.phase.trim(),
      title: draft.title.trim(),
      content: draft.content.trim(),
      author_name: draft.author_name,
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

  const toolbarButtonClass =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-abyss-500/40 bg-abyss-800/50 text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl';

  return (
    <section className="mx-auto max-w-3xl space-y-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300">
            <Sparkles className="h-4 w-4 text-foam-400" />
            <span>Alpha / Beta Phase Log</span>
          </div>
          <h2 className="font-display text-3xl font-bold text-pearl sm:text-4xl">
            The Abyssal Whispers
          </h2>
          <p className="mt-1 text-sm text-muted">Patch Notes &amp; Dev Updates</p>
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
          <span>Add New Whisper</span>
        </button>
      )}

      {isAdmin && formOpen && (
        <div className="glass-panel rounded-2xl border-foam-400/25 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-pearl">
              {editingId ? 'Edit Whisper' : 'New Whisper'}
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
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={draft.phase}
                onChange={(e) => setDraft((d) => ({ ...d, phase: e.target.value }))}
                placeholder="Phase (e.g., Phase 7)"
                className="min-h-11 w-full rounded-xl border border-abyss-400/30 bg-abyss-900/60 px-3.5 py-2.5 text-sm text-pearl placeholder:text-muted focus:border-foam-400/50 focus:outline-none"
              />
              <div className="w-full sm:w-44">
                <label
                  htmlFor="post-author"
                  className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted"
                >
                  Posted By
                </label>
                <select
                  id="post-author"
                  value={draft.author_name}
                  onChange={(e) => setDraft((d) => ({ ...d, author_name: e.target.value }))}
                  className="min-h-11 w-full rounded-xl border border-abyss-400/30 bg-abyss-900/60 px-3 py-2.5 text-sm text-pearl focus:border-foam-400/50 focus:outline-none"
                >
                  {AUTHOR_OPTIONS.map((name) => (
                    <option key={name} value={name} className="bg-abyss-900 text-pearl">
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Title"
              className="w-full rounded-xl border border-abyss-400/30 bg-abyss-900/60 px-3.5 py-2.5 text-sm text-pearl placeholder:text-muted focus:border-foam-400/50 focus:outline-none"
            />

            {/* Formatting toolbar + Write / Preview toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-abyss-500/30 bg-abyss-900/40 px-2 py-1.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => wrapSelection('**', '**', 'bold text')}
                  className={toolbarButtonClass}
                  aria-label="Bold"
                  title="Bold (**text**)"
                >
                  <Bold className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('*', '*', 'italic text')}
                  className={toolbarButtonClass}
                  aria-label="Italic"
                  title="Italic (*text*)"
                >
                  <Italic className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => prefixSelection('- ')}
                  className={toolbarButtonClass}
                  aria-label="Bullet list"
                  title="Bullet list (- item)"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => prefixSelection('1. ')}
                  className={toolbarButtonClass}
                  aria-label="Numbered list"
                  title="Numbered list (1. item)"
                >
                  <ListOrdered className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('[', '](https://)', 'label', false)}
                  className={toolbarButtonClass}
                  aria-label="Insert link"
                  title="Link ([label](https://...))"
                >
                  <Link2 className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-abyss-600/40 bg-abyss-950/50 p-0.5">
                {(['write', 'preview'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFormMode(mode)}
                    className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium capitalize transition-colors ${
                      formMode === mode
                        ? 'bg-abyss-500/40 text-pearl'
                        : 'text-muted hover:text-pearl'
                    }`}
                  >
                    {mode === 'write' ? <PenLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span>{mode === 'write' ? 'Write' : 'Preview'}</span>
                  </button>
                ))}
              </div>
            </div>

            {formMode === 'write' ? (
              <textarea
                ref={bodyRef}
                value={draft.content}
                onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                placeholder={"What's new in the deep?\n\n**Bold**, *italic*, - lists, 1. numbered, [links](https://...)"}
                rows={7}
                className="w-full resize-y rounded-xl border border-abyss-400/30 bg-abyss-900/60 px-3.5 py-2.5 text-sm leading-relaxed text-pearl placeholder:text-muted focus:border-foam-400/50 focus:outline-none"
              />
            ) : (
              <div className="min-h-[10rem] rounded-xl border border-abyss-400/30 bg-abyss-950/40 px-3.5 py-2.5">
                {draft.content.trim() ? (
                  <NewsMarkdownBody content={draft.content} />
                ) : (
                  <p className="py-6 text-center text-sm text-muted">Nothing to preview yet.</p>
                )}
              </div>
            )}

            {formError && (
              <p className="text-xs font-medium text-coral-300">{formError}</p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting || formMode === 'preview'}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-foam-500/25 px-4 py-2 text-xs font-semibold text-foam-100 transition-all hover:bg-foam-500/35 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{editingId ? 'Save Changes' : 'Publish Post'}</span>
              </button>
              {formMode === 'preview' && (
                <span className="text-[11px] text-muted">Switch back to Write to publish</span>
              )}
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
          The deep is quiet... no whispers yet.
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

                {(post.author_name || post.created_at) && (
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                    {post.author_name && (
                      <span className="rounded-full border border-foam-400/30 bg-foam-500/10 px-2 py-0.5 font-medium text-foam-300">
                        By {post.author_name}
                      </span>
                    )}
                    <span className="text-muted/80">{formatPostDate(post.created_at)}</span>
                  </div>
                )}

                <h3 className="font-display text-lg font-semibold text-pearl sm:text-xl">
                  {post.title}
                </h3>
                <div className="mt-2 text-sm leading-relaxed">
                  <NewsMarkdownBody content={post.content} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
