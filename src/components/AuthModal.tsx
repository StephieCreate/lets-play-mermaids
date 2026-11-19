import { useState, useEffect, type FormEvent } from 'react';
import { X, Waves, LogIn, UserPlus, Loader2, AlertCircle, KeyRound, MailCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type Mode = 'signin' | 'signup' | 'reset';

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const { signIn, signUp, resetPasswordForEmail } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
      setResetSent(false);
      setMode('signin');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (mode === 'reset') {
      const { error: errMsg } = await resetPasswordForEmail(email.trim());
      setSubmitting(false);
      if (errMsg) {
        setError(errMsg);
        return;
      }
      setResetSent(true);
      return;
    }

    const fn = mode === 'signin' ? signIn : signUp;
    const { error: errMsg } = await fn(email.trim(), password);

    if (errMsg) {
      setError(errMsg);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setEmail('');
    setPassword('');
    onClose();
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setResetSent(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-abyss-950/80 backdrop-blur-sm animate-fade-in" />

      {/* Modal */}
      <div
        className="glass-panel relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl shadow-abyss-950/50 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-abyss-700/40 hover:text-pearl"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-abyss-700/40">
              {mode === 'reset' ? (
                <KeyRound className="h-7 w-7 text-abyss-200" />
              ) : (
                <Waves className="h-7 w-7 text-abyss-200 animate-wave-slow" />
              )}
            </div>
          </div>
          <h2 className="font-display text-2xl font-semibold text-pearl text-glow-soft">
            {mode === 'signin' ? 'Welcome Back' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {mode === 'signin'
              ? 'Sign in to continue your story.'
              : mode === 'signup'
                ? 'Begin your journey into the dark ocean.'
                : 'Enter your email and we will send you a recovery link.'}
          </p>
        </div>

        {resetSent ? (
          <div className="space-y-6 text-center">
            <div className="flex items-start gap-3 rounded-xl border border-foam-400/30 bg-foam-900/20 p-4 text-left">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-foam-300" />
              <p className="text-sm leading-relaxed text-foam-100">
                If an account exists for this email, a password recovery link has been sent.
              </p>
            </div>
            <button
              onClick={() => switchMode('signin')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-6 py-3.5 text-sm font-semibold text-pearl shadow-lg shadow-abyss-900/50 transition-all hover:from-abyss-400 hover:to-abyss-300 hover:text-glow"
            >
              <LogIn className="h-4 w-4" />
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            {mode !== 'reset' && (
              <div className="mb-6 flex rounded-lg bg-abyss-900/60 p-1">
                <button
                  onClick={() => switchMode('signin')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${
                    mode === 'signin'
                      ? 'bg-abyss-600/40 text-pearl'
                      : 'text-muted hover:text-pearl'
                  }`}
                >
                  <LogIn className="h-4 w-4" />
                  Sign In
                </button>
                <button
                  onClick={() => switchMode('signup')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${
                    mode === 'signup'
                      ? 'bg-abyss-600/40 text-pearl'
                      : 'text-muted hover:text-pearl'
                  }`}
                >
                  <UserPlus className="h-4 w-4" />
                  Sign Up
                </button>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium text-pearl/80">
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-4 py-3 text-pearl placeholder-muted/50 outline-none transition-colors focus:border-abyss-400/60 focus:bg-abyss-800/60"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              {mode !== 'reset' && (
                <div>
                  <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium text-pearl/80">
                    Password
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-4 py-3 text-pearl placeholder-muted/50 outline-none transition-colors focus:border-abyss-400/60 focus:bg-abyss-800/60"
                    placeholder="At least 6 characters"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  />
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-6 py-3.5 text-sm font-semibold text-pearl shadow-lg shadow-abyss-900/50 transition-all hover:from-abyss-400 hover:to-abyss-300 hover:text-glow disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === 'signin' ? 'Signing in...' : mode === 'signup' ? 'Creating account...' : 'Sending link...'}
                  </>
                ) : (
                  <>
                    {mode === 'signin' ? (
                      <><LogIn className="h-4 w-4" />Sign In</>
                    ) : mode === 'signup' ? (
                      <><UserPlus className="h-4 w-4" />Create Account</>
                    ) : (
                      <><KeyRound className="h-4 w-4" />Send Recovery Link</>
                    )}
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 text-center">
              {mode === 'signin' && (
                <button
                  onClick={() => switchMode('reset')}
                  className="text-xs font-medium text-muted underline-offset-4 transition-colors hover:text-foam-300 hover:underline"
                >
                  Forgot password?
                </button>
              )}
              {mode === 'reset' && (
                <button
                  onClick={() => switchMode('signin')}
                  className="text-xs font-medium text-muted underline-offset-4 transition-colors hover:text-foam-300 hover:underline"
                >
                  Back to sign in
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
