import { useEffect, useState } from 'react';
import { Check, Copy, Download, Share2, X } from 'lucide-react';

interface MobileExportModalProps {
  open: boolean;
  filename: string;
  content: string;
  mimeType: string;
  onClose: () => void;
}

/**
 * Manual export fallback for mobile/tablet. Each button runs inside a fresh
 * user tap, which iOS requires before it will open the share sheet.
 */
export default function MobileExportModal({ open, filename, content, mimeType, onClose }: MobileExportModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    setBlobUrl(url);
    setCopied(false);
    return () => {
      URL.revokeObjectURL(url);
      setBlobUrl(null);
    };
  }, [open, content, mimeType]);

  if (!open) return null;

  const handleShare = async () => {
    const attempts: Array<{ name: string; type: string }> = [
      { name: filename, type: mimeType },
      { name: filename, type: 'text/plain' },
      { name: filename.replace(/\.[^.]+$/, '') + '.txt', type: 'text/plain' },
    ];
    for (const attempt of attempts) {
      try {
        const file = new File([content], attempt.name, { type: attempt.type });
        if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) continue;
        await navigator.share({ files: [file] });
        onClose();
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        continue;
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable; the download button still works.
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-abyss-950/85 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-md rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-pearl">Your file is ready</h3>
            <p className="mt-1 break-all text-xs text-muted">{filename}</p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-pearl"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => void handleShare()}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-abyss-500/80 px-4 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400"
          >
            <Share2 className="h-4 w-4" />
            Share / Save to Files
          </button>
          {blobUrl && (
            <a
              href={blobUrl}
              download={filename}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-abyss-600/40 bg-abyss-800/40 px-4 py-2.5 text-sm font-medium text-pearl transition-colors hover:bg-abyss-700/50"
            >
              <Download className="h-4 w-4" />
              Direct Download
            </a>
          )}
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-abyss-600/40 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-pearl"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy Raw Text'}
          </button>
        </div>
      </div>
    </div>
  );
}
