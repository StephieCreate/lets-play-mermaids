import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X, Bug, Loader2, AlertCircle, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { submitBugReport } from '@/lib/bugReports';

interface BugReportModalProps {
  open: boolean;
  playthroughId: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}

const MAX_DESCRIPTION_LENGTH = 5000;

export default function BugReportModal({ open, playthroughId, onClose, onSubmitted }: BugReportModalProps) {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
      textareaRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const trimmed = description.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setSubmitting(true);
    const errorMessage = await submitBugReport({
      userId: user?.id ?? null,
      playthroughId,
      description: trimmed,
    });

    if (errorMessage) {
      setError(errorMessage);
      setSubmitting(false);
      return;
    }

    setDescription('');
    setSubmitting(false);
    onSubmitted();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      onClick={() => { if (!submitting) onClose(); }}
    >
      <div className="absolute inset-0 bg-abyss-950/80 backdrop-blur-sm animate-fade-in" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
        className="glass-panel relative z-10 w-full max-w-lg rounded-2xl p-6 shadow-2xl shadow-abyss-950/50 animate-fade-in-up sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={submitting}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-abyss-700/40 hover:text-pearl disabled:opacity-50"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-coral-900/30">
            <Bug className="h-5 w-5 text-coral-300" />
          </div>
          <div>
            <h2 id="bug-report-title" className="font-display text-xl font-semibold text-pearl">
              Report a Bug
            </h2>
            <p className="text-sm text-muted">Tell us what happened and we will look into it.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label htmlFor="bug-report-description" className="text-sm font-medium text-pearl">
            What went wrong?
          </label>
          <textarea
            id="bug-report-description"
            ref={textareaRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_DESCRIPTION_LENGTH}
            rows={6}
            disabled={submitting}
            placeholder="Describe what you were doing and what you expected to happen."
            className="w-full resize-y rounded-xl border border-abyss-600/40 bg-abyss-950/60 px-4 py-3 text-sm leading-relaxed text-pearl placeholder:text-muted/60 transition-colors focus:border-abyss-300/60 focus:outline-none focus:ring-2 focus:ring-abyss-400/20 disabled:opacity-60"
          />

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
              disabled={submitting}
              className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-pearl disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-abyss-500 to-abyss-400 px-5 py-2 text-sm font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Sending...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
