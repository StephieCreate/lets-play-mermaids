import { useRef, useState, type ChangeEvent } from 'react';
import { Download, Loader2, Upload } from 'lucide-react';
import {
  MAX_CARTRIDGE_BYTES,
  exportCartridge,
  importCartridge,
  parseCartridge,
  type CartridgeRule,
} from '@/lib/gameCartridge';

interface GameCartridgeControlsProps {
  userId: string;
  onRulesImported: (rules: CartridgeRule[]) => void;
}

type Status = { tone: 'success' | 'error'; message: string } | null;

const CARTRIDGE_FILENAME = 'mermaids-dark-ocean-cartridge.json';

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsText(file);
  });
}

type Delivery = 'shared' | 'cancelled' | 'downloaded';

async function downloadJson(json: string, filename: string): Promise<Delivery> {
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });

  let canShareFiles = false;
  try {
    canShareFiles =
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] });
  } catch {
    canShareFiles = false;
  }

  if (canShareFiles) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export default function GameCartridgeControls({ userId, onRulesImported }: GameCartridgeControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const handleExport = async () => {
    setExporting(true);
    setStatus(null);
    try {
      const json = await exportCartridge();
      const delivery = await downloadJson(json, CARTRIDGE_FILENAME);
      setStatus({
        tone: 'success',
        message:
          delivery === 'shared'
            ? 'Your game cartridge is ready. Choose where to save it.'
            : delivery === 'cancelled'
              ? 'Export cancelled.'
              : 'Your game cartridge has been downloaded.',
      });
    } catch (err) {
      console.error('Cartridge export failed', err);
      setStatus({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Could not export your cartridge. Please try again.',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > MAX_CARTRIDGE_BYTES) {
      setStatus({ tone: 'error', message: 'That file is too large to be a game cartridge.' });
      return;
    }

    setImporting(true);
    setStatus(null);
    try {
      const text = await readFileAsText(file);
      const parsed = parseCartridge(text);
      const result = await importCartridge(userId, parsed);
      onRulesImported([...result.added, ...result.updated]);

      const parts = [`Imported ${plural(result.added.length + result.updated.length, 'rule')}.`];
      if (result.updated.length > 0) {
        parts.push(`${plural(result.updated.length, 'rule')} were updated.`);
      }
      if (parsed.skippedEntries > 0) {
        parts.push(`${plural(parsed.skippedEntries, 'entry')} in the file were invalid and skipped.`);
      }
      if (parsed.removedSensitive > 0) {
        parts.push(`Removed ${plural(parsed.removedSensitive, 'sensitive field')} from the file.`);
      }
      setStatus({ tone: 'success', message: parts.join(' ') });
    } catch (err) {
      console.error('Cartridge import failed', err);
      setStatus({
        tone: 'error',
        message: err instanceof SyntaxError
          ? 'This file is not valid JSON.'
          : err instanceof Error
            ? err.message
            : 'Could not import this cartridge. Please try again.',
      });
    } finally {
      setImporting(false);
    }
  };

  const buttonClass =
    'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-abyss-400/40 bg-abyss-700/30 px-4 py-2.5 text-sm font-medium text-pearl transition-all hover:border-abyss-300/60 hover:bg-abyss-600/40 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <button onClick={handleExport} disabled={exporting || importing} className={buttonClass}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Game Cartridge
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={exporting || importing}
          className={buttonClass}
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Import Game Cartridge
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>
      {status && (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            status.tone === 'success'
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
              : 'border-coral-600/30 bg-coral-600/10 text-coral-300'
          }`}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
