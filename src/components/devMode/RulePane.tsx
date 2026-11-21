import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Pencil, Save, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { DevFile } from '@/components/devMode/versionScanner';

interface RulePaneProps {
  file: DevFile | null;
  files: DevFile[];
  attached: boolean;
  onAttachToggle: () => void;
  onSelectFile: (id: string) => void;
  onSaveContent: (dbId: string, kind: 'rule' | 'apex', content: string) => void;
  label: string;
}

export default function RulePane({
  file,
  files,
  attached,
  onAttachToggle,
  onSelectFile,
  onSaveContent,
  label,
}: RulePaneProps) {
  const [searchText, setSearchText] = useState('');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filteredFiles = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) return files;
    return files.filter(
      (f) => f.title.toLowerCase().includes(needle) || f.slug.toLowerCase().includes(needle),
    );
  }, [files, searchText]);

  if (!file) {
    return (
      <section className="glass-panel min-w-0 rounded-2xl p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-abyss-300/70">{label}</p>
        {files.length === 0 ? (
          <p className="text-sm text-muted">No documents available yet.</p>
        ) : (
          <p className="text-sm text-muted">Select a document below to open it.</p>
        )}
        <FileSelector files={filteredFiles} activeId={null} onSelect={onSelectFile} />
      </section>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleSave = async () => {
    if (!file || file.kind !== 'rule') return;
    setSaving(true);
    setSaveError(null);
    const { error } = await supabase.from('rule_documents').upsert(
      {
        slug: file.slug,
        title: file.title,
        content: draft,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,slug' },
    );
    if (error) {
      setSaveError('The changes could not be saved. Please try again.');
    } else {
      onSaveContent(file.dbId, file.kind, draft);
      setEditing(false);
    }
    setSaving(false);
  };

  return (
    <section className="glass-panel flex min-w-0 flex-col rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-abyss-300/70">{label}</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAttachToggle}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              attached
                ? 'border-foam-400/50 bg-foam-900/30 text-foam-200'
                : 'border-abyss-500/35 bg-abyss-800/40 text-muted hover:text-pearl'
            }`}
            title={attached ? 'Attached to Dev Chat — click to detach' : 'Attach this file to the Dev Chat context'}
          >
            <Check className="h-3.5 w-3.5" />
            <span>{attached ? 'Attached' : 'Attach to Chat'}</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-abyss-500/35 bg-abyss-800/40 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-pearl"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          {file.kind === 'rule' &&
            (editing ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft('');
                    setSaveError(null);
                  }}
                  disabled={saving}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-abyss-500/35 text-muted hover:text-pearl"
                  aria-label="Cancel editing"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-abyss-500/80 px-2.5 py-1.5 text-xs font-semibold text-pearl hover:bg-abyss-400 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{saving ? 'Saving...' : 'Save'}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft(file.content);
                  setEditing(true);
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-abyss-500/35 bg-abyss-800/40 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-pearl"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Edit</span>
              </button>
            ))}
        </div>
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[18rem] w-full flex-1 resize-y rounded-xl border border-abyss-600/40 bg-abyss-950/55 p-3 font-mono text-xs leading-6 text-pearl outline-none focus:border-abyss-400/60"
          spellCheck={false}
        />
      ) : (
        <pre className="max-h-[22rem] min-h-[12rem] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-abyss-700/30 bg-abyss-950/35 p-3 font-mono text-xs leading-6 text-muted">
          {file.content || 'This document is empty.'}
        </pre>
      )}

      {saveError && (
        <p className="mt-2 rounded-lg border border-coral-500/30 bg-coral-900/20 px-3 py-2 text-xs text-coral-300">
          {saveError}
        </p>
      )}

      <FileSelector files={filteredFiles} activeId={file.id} onSelect={onSelectFile} />
    </section>
  );
}

function FileSelector({
  files,
  activeId,
  onSelect,
}: {
  files: DevFile[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (files.length === 0) {
    return <p className="mt-3 text-xs text-muted">No matching documents.</p>;
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-9 w-full items-center justify-between rounded-lg border border-abyss-600/40 bg-abyss-900/40 px-3 text-xs font-medium text-muted transition-colors hover:text-pearl"
      >
        <span className="truncate">
          {activeId
            ? files.find((f) => f.id === activeId)?.title ?? 'Choose a document'
            : 'Choose a document'}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
      </button>
      {open && (
        <div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-abyss-700/30 bg-abyss-950/50 p-1">
          {files.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                onSelect(f.id);
                setOpen(false);
              }}
              className={`w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                f.id === activeId
                  ? 'bg-abyss-500/30 text-pearl'
                  : 'text-muted hover:bg-abyss-800/50 hover:text-pearl'
              }`}
            >
              <span className="mr-1.5 text-[10px] uppercase text-abyss-300/60">
                {f.kind === 'apex' ? 'Apex' : 'Rule'}
              </span>
              {f.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
