import { useEffect, useState, useCallback } from 'react';
import {
  Key,
  Sparkles,
  Check,
  Loader2,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  Star,
  Calculator,
  ShieldOff,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Provider = 'deepseek' | 'openai' | 'gemini' | 'claude' | 'custom';

interface SafeKeyRow {
  id: string;
  user_id: string;
  label: string;
  provider: Provider;
  last_four: string | null;
  base_url: string | null;
  is_active: boolean;
  exclude_auto_delete: boolean;
  created_at: string;
}

interface AIConfigurationProps {
  onSignIn: () => void;
}

const PROVIDER_INFO: Record<
  Provider,
  { label: string; defaultLabel: string; hint: string; placeholder: string; supportsBaseUrl: boolean }
> = {
  deepseek: {
    label: 'DeepSeek',
    defaultLabel: 'DeepSeek Key',
    hint: 'Paste your DeepSeek API key (starts with sk-).',
    placeholder: 'sk-...',
    supportsBaseUrl: false,
  },
  openai: {
    label: 'OpenAI / ChatGPT',
    defaultLabel: 'OpenAI Key',
    hint: 'Paste your OpenAI API key (starts with sk-).',
    placeholder: 'sk-...',
    supportsBaseUrl: false,
  },
  gemini: {
    label: 'Google Gemini',
    defaultLabel: 'Gemini Key',
    hint: 'Paste your Google AI Studio API key.',
    placeholder: 'AIza...',
    supportsBaseUrl: false,
  },
  claude: {
    label: 'Anthropic Claude',
    defaultLabel: 'Claude Key',
    hint: 'Paste your Anthropic API key (starts with sk-ant-).',
    placeholder: 'sk-ant-...',
    supportsBaseUrl: false,
  },
  custom: {
    label: 'Custom / Local AI',
    defaultLabel: 'Local AI Key',
    hint: 'Any OpenAI-compatible endpoint like LM Studio or Ollama.',
    placeholder: 'sk-local...',
    supportsBaseUrl: true,
  },
};

const AVERAGE_TOKENS_PER_TURN = 172000;

interface ModelOption {
  id: string;
  label: string;
  costPerTurn: number;
}

const MODELS_BY_PROVIDER: Record<Provider, ModelOption[]> = {
  deepseek: [
    { id: 'deepseek-v4-pro', label: 'DeepSeek-V4-Pro', costPerTurn: 0.0185 },
    { id: 'deepseek-flash', label: 'DeepSeek-V4.1-Flash', costPerTurn: 0.0045 },
  ],
  openai: [
    { id: 'openai-gpt4o-mini', label: 'GPT-4o Mini', costPerTurn: 0.012 },
    { id: 'openai-gpt4o', label: 'GPT-4o (Premium)', costPerTurn: 0.05 },
  ],
  gemini: [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', costPerTurn: 0.025 }],
  claude: [
    { id: 'claude-haiku-5.5', label: 'Claude Haiku 5.5', costPerTurn: 0.015 },
    { id: 'claude-sonnet-5.5', label: 'Claude Sonnet 5.5', costPerTurn: 0.075 },
  ],
  custom: [{ id: 'local-ai', label: 'Custom / Local AI', costPerTurn: 0.0 }],
};

const DEFAULT_PRICING: ModelOption = MODELS_BY_PROVIDER.deepseek[0];

export default function AIConfiguration({ onSignIn }: AIConfigurationProps) {
  const { user } = useAuth();
  const [keys, setKeys] = useState<SafeKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Add-form state
  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState<Provider>('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);

  // Estimator State
  const [turnsPerDay, setTurnsPerDay] = useState(35);
  const [activeModelPricing, setActiveModelPricing] = useState<ModelOption>(DEFAULT_PRICING);

  // 30-day auto-delete exclusion warning
  const [exclusionTarget, setExclusionTarget] = useState<SafeKeyRow | null>(null);

  const updateEstimator = useCallback(() => {
    const activeKey = keys.find((k) => k.is_active);
    if (activeKey) {
      const storedModelId = localStorage.getItem(`model_pref_${activeKey.id}`);
      const providerModels = MODELS_BY_PROVIDER[activeKey.provider];
      const matchedModel = providerModels.find((m) => m.id === storedModelId) || providerModels[0];
      setActiveModelPricing(matchedModel);
    } else {
      setActiveModelPricing(DEFAULT_PRICING);
    }
  }, [keys]);

  useEffect(() => {
    updateEstimator();
    const handleStorageChange = () => updateEstimator();
    window.addEventListener('model_pref_changed', handleStorageChange);
    return () => window.removeEventListener('model_pref_changed', handleStorageChange);
  }, [updateEstimator]);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    await supabase.rpc('purge_expired_ai_keys');
    const { data, error: qErr } = await supabase
      .from('user_ai_keys_safe')
      .select(
        'id, user_id, label:key_label, provider, last_four:masked_key, base_url:custom_endpoint, is_active, exclude_auto_delete, created_at',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (qErr) {
      setError(qErr.message);
    } else {
      setKeys((data as SafeKeyRow[]) ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    window.setTimeout(() => setSuccess(null), 3500);
  };

  const resetForm = () => {
    setLabel('');
    setProvider('deepseek');
    setApiKey('');
    setBaseUrl('');
    setShowKey(false);
    setShowAddForm(false);
  };

  const handleAdd = async () => {
    if (!apiKey.trim()) {
      setError('Paste an API key first.');
      return;
    }
    if (provider === 'custom' && !baseUrl.trim()) {
      setError('Custom providers need a base URL (e.g. http://localhost:1234/v1).');
      return;
    }
    setBusyAction('add');
    setError(null);
    const { data: newId, error: rpcErr } = await supabase.rpc('upsert_ai_key', {
      p_label: label.trim() || PROVIDER_INFO[provider].defaultLabel,
      p_provider: provider,
      p_key: apiKey.trim(),
      p_base_url: provider === 'custom' ? baseUrl.trim() : null,
    });

    if (rpcErr) {
      setError(rpcErr.message);
    } else {
      flashSuccess('Key saved and encrypted securely.');
      resetForm();
      await load();
      void newId;
    }
    setBusyAction(null);
  };

  const handleDelete = async (keyId: string) => {
    setBusyAction(`delete-${keyId}`);
    setError(null);
    const { error: rpcErr } = await supabase.rpc('delete_ai_key', { p_key_id: keyId });
    if (rpcErr) {
      setError(rpcErr.message);
    } else {
      flashSuccess('Key removed.');
      await load();
    }
    setBusyAction(null);
  };

  const handleActivate = async (keyId: string) => {
    setBusyAction(`activate-${keyId}`);
    setError(null);
    const { error: rpcErr } = await supabase.rpc('set_active_ai_key', { p_key_id: keyId });
    if (rpcErr) {
      setError(rpcErr.message);
    } else {
      flashSuccess('Active key switched.');
      await load();
    }
    setBusyAction(null);
  };

  const requestExclusion = (row: SafeKeyRow) => {
    if (!row.exclude_auto_delete) {
      setExclusionTarget(row);
    } else {
      void setExclusion(row.id, false);
    }
  };

  const setExclusion = async (keyId: string, exclude: boolean) => {
    setBusyAction(`exclude-${keyId}`);
    setError(null);
    const { error: rpcErr } = await supabase.rpc('set_ai_key_auto_delete_exclusion', {
      p_key_id: keyId,
      p_exclude: exclude,
    });
    if (rpcErr) {
      setError(rpcErr.message);
    } else {
      flashSuccess(
        exclude ? 'Key excluded from 30-day auto-delete.' : '30-day auto-delete protection restored.',
      );
      await load();
    }
    setBusyAction(null);
  };

  const formatTokens = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'k';
    return num.toString();
  };

  if (!user) {
    return (
      <section id="ai-config" className="relative z-10 mx-auto max-w-3xl">
        <div className="glass-panel rounded-2xl p-8 text-center sm:p-12">
          <Key className="mx-auto mb-4 h-10 w-10 text-abyss-300/70" />
          <h2 className="font-display text-2xl font-semibold text-pearl sm:text-3xl">
            AI Configuration
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
            Bring your own AI API key to power your story. Use DeepSeek, OpenAI, Gemini, or any
            OpenAI-compatible provider. Your key is encrypted and never shown to anyone — not even
            you, after saving. Sign in to get started.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-6 py-3 text-sm font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300"
          >
            Sign In
          </button>
        </div>
      </section>
    );
  }

  const dailyCost = turnsPerDay * activeModelPricing.costPerTurn;
  const monthlyCost = dailyCost * 30;
  const dailyTokens = turnsPerDay * AVERAGE_TOKENS_PER_TURN;
  const monthlyTokens = dailyTokens * 30;

  return (
    <section id="ai-config" className="relative z-10 mx-auto max-w-3xl space-y-6">
      {/* --- API KEYS LIST AND FORM --- */}
      <div className="glass-panel rounded-2xl p-5 sm:p-8">
        <div className="mb-6 flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-abyss-700/40 text-abyss-200">
            <Key className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300/70">
              <Sparkles className="h-3.5 w-3.5" />
              API Settings
            </div>
            <h2 className="font-display text-2xl font-semibold text-pearl sm:text-3xl">
              Your AI Keys
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Bring your own API key from any provider. At least one key is needed to play. Keys are
              encrypted at rest and never displayed again after saving.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-coral-600/30 bg-coral-600/10 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-coral-300" />
            <p className="text-sm text-coral-300">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-4">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <p className="text-sm text-emerald-200">{success}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-3 py-8 text-sm text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading your keys...
          </div>
        ) : (
          <div className="space-y-4">
            {keys.length === 0 && !showAddForm && (
              <div className="rounded-xl border border-coral-600/30 bg-coral-600/10 p-5 text-center">
                <p className="text-sm text-coral-200">
                  You need at least one API key to play. Add one below to get started.
                </p>
              </div>
            )}

            {keys.map((k) => (
              <KeyCard
                key={k.id}
                row={k}
                busyDelete={busyAction === `delete-${k.id}`}
                busyActivate={busyAction === `activate-${k.id}`}
                busyExclude={busyAction === `exclude-${k.id}`}
                onDelete={() => handleDelete(k.id)}
                onActivate={() => handleActivate(k.id)}
                onToggleExclusion={() => requestExclusion(k)}
              />
            ))}

            {showAddForm ? (
              <div className="rounded-xl border border-abyss-500/40 bg-abyss-900/50 p-4 sm:p-5">
                <h3 className="mb-4 font-display text-lg font-semibold text-pearl">
                  Add a New Key
                </h3>

                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                  Provider
                </label>
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(Object.keys(PROVIDER_INFO) as Provider[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProvider(p)}
                      className={`rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all ${
                        provider === p
                          ? 'border-foam-400/50 bg-foam-900/25 text-foam-200'
                          : 'border-abyss-600/40 bg-abyss-950/40 text-muted hover:border-abyss-400/40 hover:text-pearl'
                      }`}
                    >
                      {PROVIDER_INFO[p].label}
                    </button>
                  ))}
                </div>

                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={PROVIDER_INFO[provider].defaultLabel}
                  className="mb-4 w-full rounded-lg border border-abyss-600/40 bg-abyss-950/50 px-4 py-2.5 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                />

                {PROVIDER_INFO[provider].supportsBaseUrl && (
                  <>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                      Base URL (Local API)
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="http://localhost:1234/v1"
                      className="mb-4 w-full rounded-lg border border-abyss-600/40 bg-abyss-950/50 px-4 py-2.5 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                    />
                  </>
                )}

                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                  API Key
                </label>
                <p className="mb-2 text-xs text-muted">{PROVIDER_INFO[provider].hint}</p>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={PROVIDER_INFO[provider].placeholder}
                    className="w-full rounded-lg border border-abyss-600/40 bg-abyss-950/50 px-4 py-2.5 pr-11 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-pearl"
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                    type="button"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={busyAction === 'add' || !apiKey.trim()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-5 py-2.5 text-sm font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busyAction === 'add' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Key className="h-4 w-4" />
                    )}
                    Save &amp; Encrypt
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-abyss-600/40 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-abyss-500/40 py-3.5 text-sm font-semibold text-muted transition-all hover:border-abyss-400/60 hover:bg-abyss-800/20 hover:text-pearl"
              >
                <Plus className="h-4 w-4" />
                Add a Key
              </button>
            )}
          </div>
        )}
      </div>

      {/* --- COST ESTIMATOR WIDGET --- */}
      <div className="glass-panel rounded-2xl p-5 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Calculator className="h-5 w-5 text-foam-400" />
            <h3 className="font-display text-xl font-semibold text-pearl">Cost Estimator</h3>
          </div>
          {keys.some((k) => k.is_active) && (
            <span className="rounded-full border border-abyss-500/40 bg-abyss-700/30 px-3 py-1 text-xs font-medium text-pearl">
              Estimating: <span className="text-foam-300">{activeModelPricing.label}</span>
            </span>
          )}
        </div>

        <p className="mb-6 text-sm leading-relaxed text-muted">
          The game loads heavy static files on every turn (~172k tokens), but utilizes prompt
          caching to keep costs down. Context windows reset every in-game morning.{' '}
          <strong className="text-pearl/90">
            Local AI models process unlimited tokens for free.
          </strong>
        </p>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-4">
            <div>
              <label className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wider text-muted">
                <span>Estimated Turns Per Day</span>
                <span className="text-pearl">{turnsPerDay} Turns</span>
              </label>
              <input
                type="range"
                min="10"
                max="100"
                value={turnsPerDay}
                onChange={(e) => setTurnsPerDay(parseInt(e.target.value, 10))}
                className="w-full accent-foam-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-xl border border-abyss-600/30 bg-abyss-900/40 p-4 sm:flex sm:shrink-0 sm:px-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-abyss-300/70">
                Daily Estimate
              </p>
              <p className="font-mono text-xl text-pearl">${dailyCost.toFixed(2)}</p>
              <p className="mt-1 font-mono text-xs text-muted/80">
                {formatTokens(dailyTokens)} tokens
              </p>
            </div>
            <div className="hidden w-px bg-abyss-600/30 sm:block" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-abyss-300/70">
                30-Day Estimate
              </p>
              <p className="font-mono text-xl text-foam-300">${monthlyCost.toFixed(2)}</p>
              <p className="mt-1 font-mono text-xs text-muted/80">
                {formatTokens(monthlyTokens)} tokens
              </p>
            </div>
          </div>
        </div>
      </div>

      <AutoDeleteWarningModal
        open={exclusionTarget !== null}
        onCancel={() => setExclusionTarget(null)}
        onAccept={() => {
          if (exclusionTarget) void setExclusion(exclusionTarget.id, true);
          setExclusionTarget(null);
        }}
      />
    </section>
  );
}

function daysRemainingFor(createdAt: string): number {
  return Math.max(
    0,
    30 - Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function AutoDeleteWarningModal({
  open,
  onCancel,
  onAccept,
}: {
  open: boolean;
  onCancel: () => void;
  onAccept: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-abyss-950/90 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl border-2 border-coral-500/50 bg-abyss-900 p-6 shadow-2xl shadow-coral-950/40 animate-fade-in-up sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-coral-900/40">
            <ShieldOff className="h-6 w-6 text-coral-300" />
          </div>
          <h2 className="font-display text-xl font-semibold text-coral-200">
            Security Warning: Long-Term Key Storage
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-pearl/80">
          By default, API keys are automatically deleted from our database after 30 days so you can
          rotate or re-enter them safely. Excluding your key from auto-deletion keeps it stored
          indefinitely, which increases your risk if your account credentials are ever compromised.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-abyss-400/40 bg-abyss-700/30 px-5 py-3 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-600/40"
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Cancel (Keep 30-Day Protection)
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-coral-600 to-coral-500 px-5 py-3 text-sm font-semibold text-pearl transition-all hover:from-coral-500 hover:to-coral-400"
          >
            <ShieldOff className="h-4 w-4 shrink-0" />
            I Accept the Risk — Exclude Key
          </button>
        </div>
      </div>
    </div>
  );
}

interface KeyCardProps {
  row: SafeKeyRow;
  busyDelete: boolean;
  busyActivate: boolean;
  busyExclude: boolean;
  onDelete: () => void;
  onActivate: () => void;
  onToggleExclusion: () => void;
}

function KeyCard({
  row,
  busyDelete,
  busyActivate,
  busyExclude,
  onDelete,
  onActivate,
  onToggleExclusion,
}: KeyCardProps) {
  const info = PROVIDER_INFO[row.provider];
  const availableModels = MODELS_BY_PROVIDER[row.provider] || [];

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem(`model_pref_${row.id}`) || availableModels[0]?.id;
  });

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModelId = e.target.value;
    setSelectedModel(newModelId);
    localStorage.setItem(`model_pref_${row.id}`, newModelId);
    window.dispatchEvent(new Event('model_pref_changed'));
  };

  return (
    <div
      className={`overflow-hidden rounded-xl border p-4 transition-colors sm:p-5 ${
        row.is_active
          ? 'border-foam-400/40 bg-foam-900/15'
          : 'border-abyss-600/40 bg-abyss-900/40'
      }`}
    >
      {/* Top Info & Model Dropdown */}
      <div className="space-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-lg font-semibold text-pearl">{row.label}</h3>
            {row.is_active && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-foam-400/40 bg-foam-900/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foam-300">
                <Star className="h-3 w-3" /> Active
              </span>
            )}
          </div>

          <p className="mt-0.5 text-xs text-muted">
            {info.label}
            {row.base_url && (
              <span className="block truncate text-muted/70">{row.base_url}</span>
            )}
          </p>

          <div className="mt-2">
            {row.exclude_auto_delete ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-coral-400/40 bg-coral-900/25 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-coral-300">
                <ShieldOff className="h-3 w-3 shrink-0" />
                Excluded from 30-day auto-delete
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-900/20 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-300">
                <Clock className="h-3 w-3 shrink-0" />
                Auto-deletes in {daysRemainingFor(row.created_at)} days
              </span>
            )}
          </div>
        </div>

        {/* Bound Model + Masked Key Row */}
        <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
          {availableModels.length > 0 && (
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-abyss-300/70">
                Bound Model
              </label>
              <select
                value={selectedModel}
                onChange={handleModelChange}
                className="min-h-10 w-full rounded-lg border border-abyss-600/40 bg-abyss-950/60 px-3 py-2 text-xs text-pearl outline-none focus:border-abyss-400/60"
              >
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex min-h-10 items-center rounded-lg border border-abyss-600/35 bg-abyss-950/50 px-3.5 py-2 font-mono text-xs text-muted">
            {row.last_four ? (
              <>
                …<span className="text-pearl/80">{row.last_four}</span>
              </>
            ) : (
              '—'
            )}
          </div>
        </div>
      </div>

      {/* Overflow-Proof Action Buttons (2-row stack on mobile, single clean row on desktop) */}
      <div className="mt-4 flex flex-col gap-2 border-t border-abyss-700/30 pt-3.5 sm:flex-row sm:items-center">
        {!row.is_active && (
          <button
            type="button"
            onClick={onActivate}
            disabled={busyActivate}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-abyss-400/35 bg-abyss-600/25 px-3.5 py-2 text-xs font-semibold text-pearl transition-colors hover:border-abyss-300/50 hover:bg-abyss-500/35 disabled:opacity-50 sm:w-auto"
          >
            {busyActivate ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Use this
          </button>
        )}

        <div className="flex items-center gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={onToggleExclusion}
            disabled={busyExclude}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 sm:flex-none ${
              row.exclude_auto_delete
                ? 'border-foam-400/40 bg-foam-900/25 text-foam-200 hover:bg-foam-800/30'
                : 'border-amber-400/40 bg-amber-900/20 text-amber-200 hover:bg-amber-800/30'
            }`}
            title={
              row.exclude_auto_delete
                ? 'Re-enable 30-day auto-delete'
                : 'Exclude this key from 30-day auto-delete'
            }
          >
            {busyExclude ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : row.exclude_auto_delete ? (
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ShieldOff className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">
              {row.exclude_auto_delete ? 'Auto-delete On' : 'Exclude from auto-delete'}
            </span>
          </button>

          <button
            type="button"
            onClick={onDelete}
            disabled={busyDelete}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-coral-400/30 bg-coral-900/20 text-coral-300 transition-colors hover:border-coral-300/60 hover:bg-coral-800/40 disabled:opacity-50"
            aria-label="Remove this key"
            title="Remove this key"
          >
            {busyDelete ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}