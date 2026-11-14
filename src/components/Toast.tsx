import { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
}

const TOAST_DURATION_MS = 3500;

export default function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="glass-panel fixed bottom-6 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium text-pearl shadow-xl shadow-abyss-950/50 animate-fade-in-up"
    >
      <CheckCircle2 className="h-5 w-5 text-emerald-300" />
      <span>{message}</span>
    </div>
  );
}
