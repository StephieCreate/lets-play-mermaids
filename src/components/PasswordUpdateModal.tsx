import { useState, type FormEvent } from 'react';
import { X, ShieldCheck, Loader2, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface PasswordUpdateModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  mandatory?: boolean;
}

export default function PasswordUpdateModal({
  open,
  onClose,
  title,
  description,
  mandatory = false,
}: PasswordUpdateModalProps) {
  const { updatePassword, clearPasswordRecovery } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: errMsg } = await updatePassword(newPassword);
    setSubmitting(false);

    if (errMsg) {
      setError(errMsg);
      return;
    }

    setSuccess(true);
    setNewPassword('');
    setConfirmPassword('');
    window.setTimeout(() => {
      setSuccess(false);
      clearPasswordRecovery();
      onClose();
    }, 1600);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-abyss-950/90 backdrop-blur-sm animate-fade-in" />
      <div
        className="glass-panel relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl shadow-abyss-950/50 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {!mandatory && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-abyss-700/40 hover:text-pearl"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-foam-900/30">
            <ShieldCheck className="h-7 w-7 text-foam-300" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-pearl">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="pw-new" className="mb-1.5 block text-sm font-medium text-pearl/80">
              New Password
            </label>
            <input
              id="pw-new"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-4 py-3 text-pearl placeholder-muted/50 outline-none transition-colors focus:border-abyss-400/60"
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label htmlFor="pw-confirm" className="mb-1.5 block text-sm font-medium text-pearl/80">
              Confirm New Password
            </label>
            <input
              id="pw-confirm"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-4 py-3 text-pearl placeholder-muted/50 outline-none transition-colors focus:border-abyss-400/60"
              placeholder="Repeat your new password"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-300">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Password updated successfully.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || success}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-6 py-3.5 text-sm font-semibold text-pearl shadow-lg shadow-abyss-900/50 transition-all hover:from-abyss-400 hover:to-abyss-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Update Password
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
