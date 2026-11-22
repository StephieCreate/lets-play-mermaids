import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Heart,
  Loader2,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  INSTALLED_VERSION_KEY,
  MAX_CARTRIDGE_BYTES,
  exportCartridge,
  normalizeVersion,
  parseCartridge,
  type CartridgeRule,
} from '@/lib/gameCartridge';
import GameCartridgeControls from '@/components/GameCartridgeControls';

interface RulesStorePanelProps {
  onRulesInstalled: (rules: CartridgeRule[]) => void;
  onSignIn: () => void;
}

interface StoreCartridge {
  id: string;
  version: string;
  filename: string;
  payload: Record<string, unknown>;
  is_active: boolean;
  uploaded_at: string;
}


function readStoredInstalledVersion(): string | null {
  try {
    const raw = localStorage.getItem(INSTALLED_VERSION_KEY);
    return raw ? normalizeVersion(raw) || null : null;
  } catch {
    return null;
  }
}

function versionSegments(version: string): number[] {
  return version
    .split('.')
    .map((part) => parseInt(part, 10))
    .map((n) => (Number.isNaN(n) ? 0 : n));
}

function isVersionCurrent(installed: string | null, active: string | null): boolean {
  if (!installed || !active) return false;
  const a = versionSegments(installed);
  const b = versionSegments(active);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return true;
}

function nextMinorVersion(version: string | null): string {
  const match = version?.match(/^(\d+)\.(\d+)$/);
  if (!match) return '1.0';
  return `${match[1]}.${parseInt(match[2], 10) + 1}`;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsText(file);
  });
}

function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function RulesStorePanel({ onRulesInstalled, onSignIn }: RulesStorePanelProps) {
  const { user, isAdmin } = useAuth();
  const [activeCartridge, setActiveCartridge] = useState<StoreCartridge | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(readStoredInstalledVersion);
  const [installing, setInstalling] = useState(false);
  const [adminNotice, setAdminNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const [adminVersion, setAdminVersion] = useState('');
  const [exporting, setExporting] = useState(false);
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const adminImportInputRef = useRef<HTMLInputElement>(null);

  const [showSupport, setShowSupport] = useState(false);

  const fetchCartridges = useCallback(async () => {
    setStoreLoading(true);
    setStoreError(null);
    const { data, error } = await supabase
      .from('store_cartridges')
      .select('id, version, filename, payload, is_active, uploaded_at')
      .order('uploaded_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Failed to load store cartridges', error);
      setStoreError('The store could not be loaded. Please try again.');
    } else {
      const rows = (data ?? []) as StoreCartridge[];
      setActiveCartridge(rows.find((row) => row.is_active) ?? null);
      setLatestVersion(rows[0]?.version ?? null);
    }
    setStoreLoading(false);
  }, []);

  useEffect(() => {
    if (user) {
      void fetchCartridges();
    } else {
      setActiveCartridge(null);
      setLatestVersion(null);
      setStoreLoading(false);
      setStoreError(null);
    }
  }, [user?.id, fetchCartridges]);

  // Prefer the newer of account-synced and local installed versions — a stale
  // older value must never regress the other source of truth.
  useEffect(() => {
    if (!user) return;
    const meta = user.user_metadata?.installed_cartridge_version;
    if (typeof meta !== 'string' || !normalizeVersion(meta)) return;
    const metaVersion = normalizeVersion(meta);
    const localVersion = normalizeVersion(installedVersion);
    const metaSegments = metaVersion.split('.').map((part) => parseInt(part, 10) || 0);
    const localSegments = localVersion.split('.').map((part) => parseInt(part, 10) || 0);
    const len = Math.max(metaSegments.length, localSegments.length);
    let metaNewerOrEqual = true;
    for (let i = 0; i < len; i++) {
      const diff = (metaSegments[i] ?? 0) - (localSegments[i] ?? 0);
      if (diff !== 0) {
        metaNewerOrEqual = diff > 0;
        break;
      }
    }
    if (metaNewerOrEqual && metaVersion !== localVersion) {
      setInstalledVersion(metaVersion);
      try {
        localStorage.setItem(INSTALLED_VERSION_KEY, metaVersion);
      } catch {
        // localStorage unavailable; state still applied for this session
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Pre-fill the admin export version with the next minor bump
  useEffect(() => {
    if (isAdmin && !adminVersion) {
      setAdminVersion(nextMinorVersion(latestVersion));
    }
  }, [isAdmin, latestVersion, adminVersion]);

  const persistInstalledVersion = async (version: string, cartridgeId?: string) => {
    const normalized = normalizeVersion(version);
    try {
      localStorage.setItem(INSTALLED_VERSION_KEY, normalized);
    } catch {
      // localStorage unavailable; state + metadata still applied
    }
    setInstalledVersion(normalized);
    if (user) {
      await supabase.auth.updateUser({
        data: {
          installed_cartridge_version: normalized,
          ...(cartridgeId ? { installed_cartridge_id: cartridgeId } : {}),
        },
      });
    }
  };

  const handleInstall = async () => {
    if (!activeCartridge || installing) return;
    setInstalling(true);
    setStoreError(null);
    const { data, error } = await supabase.rpc('install_store_cartridge');
    if (error) {
      console.error('Cartridge install failed', error);
      setStoreError('The cartridge could not be installed. Please try again.');
      setInstalling(false);
      return;
    }
    const result = (Array.isArray(data) ? data[0] : data) as {
      version: string;
      installed_count: number;
      rules: CartridgeRule[];
    } | null;
    setInstalling(false);
    if (!result || !Array.isArray(result.rules)) {
      setStoreError('The cartridge response was invalid. Please try again.');
      return;
    }
    if (!activeCartridge) return;
    onRulesInstalled(result.rules);
    // Read from the active cartridge row first; fall back to the RPC result
    const version = activeCartridge.version || result.version;
    await persistInstalledVersion(version, activeCartridge.id);
    // Dispatch AFTER saving so App.tsx re-reads the persisted value
    window.dispatchEvent(new Event('mermaids_cartridge_updated'));
  };

  const handleDownload = () => {
    if (!activeCartridge) return;
    downloadJson(JSON.stringify(activeCartridge.payload, null, 2), activeCartridge.filename);
  };

  const handleAdminExport = async () => {
    const version = adminVersion.trim();
    if (!version || exporting) return;
    setExporting(true);
    setStoreError(null);
    try {
      const json = await exportCartridge();
      const parsed = parseCartridge(json);
      const payload = {
        format: 'mermaids-game-cartridge',
        cartridgeVersion: 2,
        version,
        exportedAt: new Date().toISOString(),
        rules: parsed.rules,
      };
      downloadJson(JSON.stringify(payload, null, 2), `dark-ocean-rules-v${version}.json`);
      const includesEngine = parsed.rules.some((rule) => rule.slug === 'universal-core-engine');
      setAdminNotice({
        text: `Exported ${parsed.rules.length} rules — ${includesEngine ? 'includes Universal Core Engine' : 'WARNING: Universal Core Engine missing'}`,
        ok: includesEngine,
      });
    } catch (err) {
      console.error('Cartridge export failed', err);
      setStoreError(err instanceof Error ? err.message : 'Could not export the cartridge. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploading) return;

    if (file.size > MAX_CARTRIDGE_BYTES) {
      setStoreError('That file is too large to be a game cartridge.');
      return;
    }

    setUploading(true);
    setStoreError(null);
    try {
      const text = await readFileAsText(file);
      const raw = JSON.parse(text) as { version?: unknown };
      const parsed = parseCartridge(text);

      const detected = typeof raw.version === 'string' ? raw.version.trim() : '';
      const version = (uploadVersion.trim() || detected).trim();
      if (!version) {
        setStoreError('This cartridge has no embedded version. Enter a version number first.');
        setUploading(false);
        return;
      }

      const payload = {
        format: 'mermaids-game-cartridge',
        cartridgeVersion: 2,
        version,
        exportedAt: new Date().toISOString(),
        rules: parsed.rules,
      };
      const filename = `dark-ocean-rules-v${version}.json`;

      const { error } = await supabase.rpc('publish_store_cartridge', {
        p_version: version,
        p_filename: filename,
        p_payload: payload,
      });
      if (error) throw error;

      setUploadVersion('');
      const includesEngine = parsed.rules.some((rule) => rule.slug === 'universal-core-engine');
      setAdminNotice({
        text: `Published ${parsed.rules.length} rules as v${version} — ${includesEngine ? 'includes Universal Core Engine' : 'WARNING: Universal Core Engine missing'}`,
        ok: includesEngine,
      });
      await fetchCartridges();
      window.dispatchEvent(new Event('mermaids_cartridge_updated'));
    } catch (err) {
      console.error('Store cartridge upload failed', err);
      setStoreError(
        err instanceof SyntaxError
          ? 'This file is not valid JSON.'
          : err instanceof Error
            ? err.message
            : 'The cartridge could not be published. Please try again.'
      );
    } finally {
      setUploading(false);
    }
  };

  const cartridgeIsCurrent = isVersionCurrent(installedVersion, activeCartridge?.version ?? null);

  const badgeClass = cartridgeIsCurrent
    ? 'inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-3.5 py-1.5 text-xs font-semibold text-emerald-300'
    : 'inline-flex min-h-9 items-center gap-2 rounded-full border border-amber-400/40 bg-coral-500/15 px-3.5 py-1.5 text-xs font-semibold text-coral-200';

  const buttonClass =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-abyss-400/40 bg-abyss-700/30 px-4 py-2.5 text-sm font-medium text-pearl transition-all hover:border-abyss-300/60 hover:bg-abyss-600/40 disabled:cursor-not-allowed disabled:opacity-50';

  if (!user) {
    return (
      <section className="glass-panel mx-auto max-w-3xl rounded-2xl p-5 text-center sm:p-8">
        <h2 className="font-display text-2xl font-semibold text-pearl">Store &amp; Cartridges</h2>
        <p className="mt-2 text-sm text-muted">
          Sign in to download and install the official rules cartridge.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="mt-4 min-h-11 rounded-xl bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400"
        >
          Sign In
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div className="glass-panel rounded-2xl p-5 sm:p-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-abyss-700/40 text-abyss-200">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold text-pearl">
              Store &amp; Cartridges
            </h2>
            <p className="text-xs text-muted">
              Install or export official game rule cartridges as mechanics are updated.
            </p>
          </div>
        </div>

        {storeLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking the store...
          </div>
        ) : storeError ? (
          <div className="flex items-center gap-2 rounded-xl border border-coral-500/30 bg-coral-900/20 px-4 py-3 text-sm text-coral-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {storeError}
          </div>
        ) : !activeCartridge ? (
          <div className="rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/25 p-6 text-center">
            <p className="text-sm text-muted">
              No official cartridge has been uploaded to the store yet. Check back soon!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={badgeClass}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {cartridgeIsCurrent
                  ? `You have the current version (v${activeCartridge.version})`
                  : `New cartridge update available! (v${activeCartridge.version})`}
              </span>
              {!installedVersion && (
                <span className="text-xs text-muted">Not installed yet</span>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleDownload}
                className={buttonClass}
              >
                <Download className="h-4 w-4" />
                Download Current Cartridge
              </button>
              <button
                type="button"
                onClick={handleInstall}
                disabled={installing}
                className={buttonClass}
              >
                {installing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Install Current Cartridge
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowSupport(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-coral-400/30 bg-coral-500/10 px-4 py-2.5 text-sm font-medium text-coral-200 transition-all hover:bg-coral-500/20"
            >
              <Heart className="h-4 w-4" />
              Support the Dev (Pay What You Want up to $15)
            </button>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="glass-panel rounded-2xl border-amber-400/25 p-5 sm:p-8">
          <h3 className="mb-1 font-display text-lg font-semibold text-amber-200">
            Admin Store Controls
          </h3>
          <p className="mb-4 text-xs text-amber-200/70">
            Export, import, and publish official cartridges. Hidden from regular players.
          </p>

          {adminNotice && (
            <p
              className={`mb-4 rounded-xl border px-4 py-2.5 text-xs font-medium ${
                adminNotice.ok
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-coral-500/30 bg-coral-900/20 text-coral-200'
              }`}
            >
              {adminNotice.text}
            </p>
          )}

          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium text-pearl">Export Rules Cartridge</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={adminVersion}
                  onChange={(e) => setAdminVersion(e.target.value)}
                  placeholder="Version (e.g., 1.4)"
                  className="min-h-11 w-full rounded-xl border border-abyss-400/30 bg-abyss-900/60 px-3.5 py-2.5 text-sm text-pearl placeholder:text-muted focus:border-amber-400/50 focus:outline-none sm:w-40"
                />
                <button
                  type="button"
                  onClick={handleAdminExport}
                  disabled={exporting || !adminVersion.trim()}
                  className={buttonClass}
                >
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Export Rules Cartridge
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-pearl">Local Cartridge Import</p>
              <GameCartridgeControls
                userId={user.id}
                onRulesImported={onRulesInstalled}
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-pearl">Upload New Store Cartridge</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={uploadVersion}
                  onChange={(e) => setUploadVersion(e.target.value)}
                  placeholder="Version override (auto-detected from file)"
                  className="min-h-11 w-full rounded-xl border border-abyss-400/30 bg-abyss-900/60 px-3.5 py-2.5 text-sm text-pearl placeholder:text-muted focus:border-amber-400/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploading}
                  className={buttonClass}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload New Store Cartridge
                </button>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleUploadChange}
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                Publishing replaces the current active store version for all players immediately.
              </p>
            </div>
          </div>
        </div>
      )}

      {showSupport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-abyss-950/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowSupport(false)}
        >
          <div
            className="glass-panel w-full max-w-md rounded-2xl p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral-500/15 text-coral-300">
                <Heart className="h-5 w-5" />
              </div>
              <h3 className="font-display text-xl font-semibold text-pearl">
                Thank you for the support!
              </h3>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              Checkout isn&apos;t wired up yet, but your willingness to support development means
              the world. A &quot;Pay What You Want (up to $15)&quot; tip button will land here in a
              future update — until then, the best support is playtesting, sharing your Custom
              Apexes on Discord, and reporting bugs!
            </p>
            <button
              type="button"
              onClick={() => setShowSupport(false)}
              className="mt-5 min-h-11 w-full rounded-xl bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
