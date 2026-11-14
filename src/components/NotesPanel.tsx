import { useEffect, useRef, useState } from 'react';
import { Check, Clipboard, Edit3, LockKeyhole, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { PlaythroughNote } from '@/types/database';

interface NotesPanelProps {
  playthroughId: string;
  tab: string;
  title: string;
  label: string;
  description: string;
  onSignIn: () => void;
}

export default function NotesPanel({ playthroughId, tab, title, label, description, onSignIn }: NotesPanelProps) {
  const { user, loading: authLoading } = useAuth();
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) {
      setContent('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('playthrough_notes')
      .select('id, playthrough_id, user_id, tab, content, created_at, updated_at')
      .eq('playthrough_id', playthroughId)
      .eq('tab', tab)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          console.error('Could not load note', fetchError);
          setError('This could not be loaded. Please try again.');
        } else {
          setContent((data as PlaythroughNote | null)?.content ?? '');
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, playthroughId, tab]);

  useEffect(() => {
    setCopied(false);
    setSearchText('');
    setReplaceText('');
  }, [tab]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const replaceNext = () => {
    if (!searchText) return;
    const start = editorRef.current?.selectionEnd ?? 0;
    const nextIndex = content.indexOf(searchText, start) >= 0
      ? content.indexOf(searchText, start)
      : content.indexOf(searchText);
    if (nextIndex < 0) return;

    const updated = `${content.slice(0, nextIndex)}${replaceText}${content.slice(nextIndex + searchText.length)}`;
    setContent(updated);
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(nextIndex, nextIndex + replaceText.length);
    });
  };

  const replaceAll = () => {
    if (!searchText) return;
    setContent(content.split(searchText).join(replaceText));
  };

  const handleAccept = async () => {
    if (!user) {
      onSignIn();
      return;
    }

    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase.from('playthrough_notes').upsert(
      { playthrough_id: playthroughId, tab, content, updated_at: new Date().toISOString() },
      { onConflict: 'playthrough_id,tab' },
    );

    if (saveError) {
      console.error('Could not save note', saveError);
      setError('Your changes could not be saved. Please try again.');
    } else {
      setEditing(false);
    }
    setSaving(false);
  };

  return (
    <section className="glass-panel min-w-0 rounded-2xl p-4 sm:p-8">
      <div className="flex flex-col gap-4 border-b border-abyss-700/30 pb-5 sm:gap-5 sm:pb-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300/70">{label}</p>
          <h2 className="break-words font-display text-2xl font-semibold text-pearl sm:text-3xl">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <button
            onClick={handleCopy}
            disabled={loading || !content}
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
              onClick={() => (user ? setEditing(true) : onSignIn())}
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
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Find"
              className="min-h-11 rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-3 py-2 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
            />
            <input
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
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
        <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted">Loading...</div>
      ) : !user ? (
        <div className="mt-6 flex min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/25 px-6 text-center">
          <LockKeyhole className="h-7 w-7 text-abyss-300/70" />
          <h3 className="mt-4 font-display text-xl font-medium text-pearl">Sign in required</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">Sign in to paste, edit, save, and copy your notes.</p>
          <button onClick={onSignIn} className="mt-6 min-h-11 rounded-lg bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400">Sign in to continue</button>
        </div>
      ) : editing ? (
        <textarea
          ref={editorRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste your markdown here..."
          className="mt-5 min-h-[16rem] w-full resize-y rounded-xl border border-abyss-600/40 bg-abyss-950/50 p-4 font-mono text-sm leading-7 text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60 sm:mt-6"
          spellCheck={false}
        />
      ) : (
        <pre className="mt-5 min-h-[14rem] whitespace-pre-wrap rounded-xl border border-abyss-700/30 bg-abyss-950/30 p-4 font-mono text-sm leading-7 text-muted sm:mt-6">
          {content || 'No markdown has been added yet. Click Edit to paste it in.'}
        </pre>
      )}
    </section>
  );
}
