import { useEffect, useState, type FormEvent } from 'react';
import { X, Loader2, AlertCircle, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { UserCustomApex } from '@/types/database';

interface CustomApexEditorModalProps {
  open: boolean;
  apex: UserCustomApex | null;
  onClose: () => void;
  onSaved: (apex: UserCustomApex) => void;
}

const MAX_TITLE = 120;
const MAX_CONTENT = 50000;

export default function CustomApexEditorModal({ open, apex, onClose, onSaved }: CustomApexEditorModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(apex?.title ?? '');
      setContent(apex?.content ?? '');
      setError(null);
      setSaving(false);
    }
  }, [open, apex]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, saving, onClose]);

  if (!open) return null;

  const trimmedTitle = title.trim();
  const canSave = trimmedTitle.length > 0 && content.trim().length > 0 && !saving;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setError(null);
    const payload = { title: trimmedTitle, content: content.trim() };

    const query = apex
      ? supabase.from('user_custom_apexes').update(payload).eq('id', apex.id)
      : supabase.from('user_custom_apexes').insert(payload);

    const { data, error: saveError } = await query
      .select('id, user_id, title, content, created_at')
      .maybeSingle();

    if (saveError || !data) {
      console.error('Failed to save custom apex', saveError);
      setError('Your custom Apex could not be saved. Please try again.');
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved(data as UserCustomApex);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div className="absolute inset-0 bg-abyss-950/80 backdrop-blur-sm animate-fade-in" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-apex-editor-title"
        className="glass-panel relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl p-6 shadow-2xl shadow-abyss-950/50 animate-fade-in-up sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={saving}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-abyss-700/40 hover:text-pearl disabled:opacity-50"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 id="custom-apex-editor-title" className="font-display text-2xl font-semibold text-pearl">
          {apex ? 'Edit Custom Apex' : 'Create New Custom Apex'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Paste your markdown rules below. When you romance this Apex, the narrator follows these rules exactly.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex min-h-0 flex-col gap-4 overflow-y-auto">
          <div>
            <label htmlFor="custom-apex-title" className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-abyss-300/70">
              Title
            </label>
            <input
              id="custom-apex-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TITLE}
              disabled={saving}
              placeholder="e.g. The Tidewater Captain"
              className="min-h-11 w-full rounded-xl border border-abyss-600/40 bg-abyss-950/60 px-4 py-2.5 text-sm text-pearl outline-none placeholder:text-muted/60 focus:border-abyss-400/60 disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="custom-apex-content" className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-abyss-300/70">
              Markdown Rules
            </label>
            <textarea
              id="custom-apex-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={MAX_CONTENT}
              disabled={saving}
              rows={14}
              placeholder="# Personality&#10;&#10;Describe voice, habits, boundaries, and how this Apex behaves..."
              className="w-full resize-y rounded-xl border border-abyss-600/40 bg-abyss-950/60 px-4 py-3 font-mono text-sm leading-relaxed text-pearl outline-none placeholder:text-muted/60 focus:border-abyss-400/60 disabled:opacity-60"
            />
            <p className="mt-1 text-right text-xs text-muted/60">{content.length} / {MAX_CONTENT}</p>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-coral-500/40 bg-coral-900/30 px-4 py-3 text-sm text-coral-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-pearl disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-abyss-500 to-abyss-400 px-5 py-2 text-sm font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
