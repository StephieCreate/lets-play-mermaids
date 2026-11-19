import { useState, useEffect, type FormEvent } from 'react';
import {
  X, Settings, Loader2, AlertCircle, Check, ShieldCheck, ShieldAlert,
  Key, Trash2, ExternalLink, Lock,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

interface UserSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onOpenAIConfig: () => void;
}

interface KeySummary {
  id: string;
  label: string;
  provider: string;
  is_active: boolean;
  exclude_auto_delete: boolean;
  created_at: string;
}

export default function UserSettingsModal({ open, onClose, onOpenAIConfig }: UserSettingsModalProps) {
  const { user, passwordAgeDays, daysUntilPasswordReset, isPasswordExpired, updatePassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const [keys, setKeys] = useState<KeySummary[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setNewPassword('');
      setConfirmPassword('');
      setPwError(null);
      setPwSuccess(false);
      setConfirmText('');
      setDeleteError(null);
      return;
    }
    if (user) {
      void loadKeys();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  if (!open || !user) return null;

  const loadKeys = async () => {
    setKeysLoading(true);
    await supabase.rpc('purge_expired_ai_keys');
    const { data } = await supabase
      .from('user_ai_keys_safe')
      .select('id, label, provider, is_active, exclude_auto_delete, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setKeys((data as KeySummary[]) ?? []);
    setKeysLoading(false);
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);

    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }

    setPwSubmitting(true);
    const { error } = await updatePassword(newPassword);
    setPwSubmitting(false);

    if (error) {
      setPwError(error);
      return;
    }
    setPwSuccess(true);
    setNewPassword('');
    setConfirmPassword('');
    window.setTimeout(() => setPwSuccess(false), 3500);
  };

  const toggleExclusion = async (key: KeySummary) => {
    setBusyKey(key.id);
    await supabase.rpc('set_ai_key_auto_delete_exclusion', {
      p_key_id: key.id,
      p_exclude: !key.exclude_auto_delete,
    });
    await loadKeys();
    setBusyKey(null);
  };

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    setDeleteBusy(true);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      setDeleteError(error.message);
      setDeleteBusy(false);
      return;
    }
    localStorage.clear();
    await supabase.auth.signOut();
    setDeleteBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-4 py-10">
      <div className="absolute inset-0 bg-abyss-950/85 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className="glass-panel relative z-10 w-full max-w-2xl rounded-2xl p-8 shadow-2xl shadow-abyss-950/50 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-abyss-700/40 hover:text-pearl"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-abyss-700/40">
            <Settings className="h-6 w-6 text-abyss-200" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold text-pearl">User Settings</h2>
            <p className="text-sm text-muted">Account, security, and data controls.</p>
          </div>
        </div>

        {/* --- SECTION 1: ACCOUNT & 90-DAY PASSWORD SECURITY --- */}
        <section className="mb-8 rounded-xl border border-abyss-600/40 bg-abyss-900/40 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-pearl">
              <ShieldCheck className="h-5 w-5 text-foam-300" />
              Account &amp; Password Security
            </h3>
            {isPasswordExpired ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-coral-500/50 bg-coral-900/30 px-3 py-1 text-xs font-semibold text-coral-300">
                <ShieldAlert className="h-3.5 w-3.5" />
                Password rotation overdue
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-abyss-500/40 bg-abyss-700/30 px-3 py-1 text-xs font-medium text-pearl">
                <ShieldCheck className="h-3.5 w-3.5 text-foam-300" />
                Password rotation due in {daysUntilPasswordReset} days
              </span>
            )}
          </div>

          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Email</p>
          <p className="mb-6 rounded-lg border border-abyss-600/40 bg-abyss-950/50 px-4 py-2.5 text-sm text-pearl/90">
            {user.email}
          </p>
          <p className="mb-5 text-xs leading-relaxed text-muted">
            Security policy: passwords rotate every 90 days. Your current password is{' '}
            {passwordAgeDays} day{passwordAgeDays === 1 ? '' : 's'} old.
          </p>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="settings-new-pw" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                  New Password
                </label>
                <input
                  id="settings-new-pw"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-abyss-600/40 bg-abyss-950/50 px-4 py-2.5 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label htmlFor="settings-confirm-pw" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                  Confirm New Password
                </label>
                <input
                  id="settings-confirm-pw"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-abyss-600/40 bg-abyss-950/50 px-4 py-2.5 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
              </div>
            </div>

            {pwError && (
              <div className="flex items-start gap-2 rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{pwError}</span>
              </div>
            )}
            {pwSuccess && (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Password updated. Your 90-day rotation timer has reset.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={pwSubmitting}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-abyss-500 to-abyss-400 px-5 py-2.5 text-sm font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pwSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Change Password
            </button>
          </form>
        </section>

        {/* --- SECTION 2: API KEY SECURITY SUMMARY --- */}
        <section className="mb-8 rounded-xl border border-abyss-600/40 bg-abyss-900/40 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-pearl">
              <Key className="h-5 w-5 text-abyss-200" />
              API Key Security
            </h3>
            <button
              onClick={() => {
                onClose();
                onOpenAIConfig();
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-abyss-400/30 bg-abyss-600/20 px-3 py-2 text-xs font-semibold text-pearl transition-colors hover:border-abyss-300/50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open AI Configuration
            </button>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-muted">
            Keys are auto-deleted 30 days after creation unless excluded, so you can rotate them safely.
          </p>

          {keysLoading ? (
            <div className="flex items-center gap-3 py-4 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading keys...
            </div>
          ) : keys.length === 0 ? (
            <p className="rounded-lg border border-abyss-600/40 bg-abyss-950/50 px-4 py-3 text-sm text-muted">
              No API keys saved yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-abyss-600/40 bg-abyss-950/50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-pearl">{k.label}</p>
                    <p className="text-xs capitalize text-muted">
                      {k.provider}
                      {k.is_active && <span className="ml-2 text-foam-300">Active</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${
                        k.exclude_auto_delete
                          ? 'border-coral-400/40 bg-coral-900/25 text-coral-300'
                          : 'border-amber-400/40 bg-amber-900/20 text-amber-300'
                      }`}
                    >
                      {k.exclude_auto_delete
                        ? 'Excluded from auto-delete'
                        : `Auto-deletes in ${Math.max(0, 30 - Math.floor((Date.now() - new Date(k.created_at).getTime()) / (1000 * 60 * 60 * 24)))} days`}
                    </span>
                    <button
                      onClick={() => toggleExclusion(k)}
                      disabled={busyKey === k.id}
                      className="rounded-lg border border-abyss-400/30 bg-abyss-600/20 px-3 py-1.5 text-xs font-medium text-pearl transition-colors hover:bg-abyss-500/30 disabled:opacity-50"
                    >
                      {busyKey === k.id ? '...' : k.exclude_auto_delete ? 'Re-enable auto-delete' : 'Exclude'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* --- SECTION 3: DANGER ZONE --- */}
        <section className="rounded-xl border-2 border-coral-600/50 bg-coral-950/20 p-6">
          <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold text-coral-300">
            <Trash2 className="h-5 w-5" />
            Danger Zone
          </h3>
          <p className="mb-4 text-sm leading-relaxed text-coral-100/80">
            Deleting your account will permanently wipe your login, saved API keys, characters,
            playthroughs, save logs, grotto registries, narrative summaries, and chat history.
            This cannot be undone.
          </p>

          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='Type DELETE to confirm'
            className="mb-4 w-full rounded-lg border border-coral-600/40 bg-abyss-950/50 px-4 py-2.5 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-coral-400/60"
          />

          {deleteError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}

          <button
            onClick={handleDeleteAccount}
            disabled={confirmText !== 'DELETE' || deleteBusy}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-coral-700 to-coral-600 px-6 py-3 text-sm font-semibold text-pearl transition-all hover:from-coral-600 hover:to-coral-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Permanently Delete Everything
          </button>
        </section>
      </div>
    </div>
  );
}
