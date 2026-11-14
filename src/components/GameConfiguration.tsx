import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Loader2, Check, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { apexes } from '@/data/apexes';
import type { Playthrough } from '@/types/database';

interface GameConfigurationProps {
  playthroughId: string;
  onSignIn: () => void;
}

const availableApexes = apexes.filter((a) => a.available);

const triadSurrogates = [
  { slug: 'elian', name: 'Elian' },
  { slug: 'garil', name: 'Garil' },
  { slug: 'heon', name: 'Heon' },
  { slug: 'lorian', name: 'Lorian' },
  { slug: 'netia', name: 'Netia' },
  { slug: 'nyx', name: 'Nyx' },
  { slug: 'rion', name: 'Rion' },
  { slug: 'shyan', name: 'Shyan' },
  { slug: 'sira', name: 'Sira' },
  { slug: 'vesper', name: 'Vesper' },
];

interface ConfigState {
  apexTarget: string;
  kipActive: boolean;
  triadActive: boolean;
  triadTarget: string;
}

export default function GameConfiguration({ playthroughId, onSignIn }: GameConfigurationProps) {
  const { user, loading: authLoading } = useAuth();
  const [config, setConfig] = useState<ConfigState>({
    apexTarget: '',
    kipActive: false,
    triadActive: false,
    triadTarget: '',
  });
  const [original, setOriginal] = useState<ConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlaythrough = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('playthroughs')
      .select('id, apex_target, story_state')
      .eq('id', playthroughId)
      .maybeSingle();

    if (fetchError || !data) {
      console.error('Could not load playthrough config', fetchError);
      setError('Game configuration could not be loaded.');
      setLoading(false);
      return;
    }

    const pt = data as Pick<Playthrough, 'id' | 'apex_target' | 'story_state'>;
    const state = (pt.story_state ?? {}) as Record<string, unknown>;
    const next: ConfigState = {
      apexTarget: pt.apex_target ?? '',
      kipActive: Boolean(state.kip_active),
      triadActive: Boolean(state.triad_active),
      triadTarget: typeof state.triad_target === 'string' ? state.triad_target : '',
    };
    setConfig(next);
    setOriginal(next);
    setLoading(false);
  }, [playthroughId]);

  useEffect(() => {
    if (user) fetchPlaythrough();
  }, [user, fetchPlaythrough]);

  const isDirty =
    original !== null &&
    (config.apexTarget !== original.apexTarget ||
      config.kipActive !== original.kipActive ||
      config.triadActive !== original.triadActive ||
      config.triadTarget !== original.triadTarget);

  const handleSave = async () => {
    if (!user) {
      onSignIn();
      return;
    }
    setSaving(true);
    setError(null);

    const { data: current, error: readError } = await supabase
      .from('playthroughs')
      .select('story_state')
      .eq('id', playthroughId)
      .maybeSingle();

    if (readError || !current) {
      console.error('Could not read story state before update', readError);
      setError('Could not save your configuration.');
      setSaving(false);
      return;
    }

    const existingState = (current.story_state ?? {}) as Record<string, unknown>;
    const updatedState = {
      ...existingState,
      kip_active: config.kipActive,
      triad_active: config.triadActive,
      triad_target: config.triadActive ? config.triadTarget : '',
    };

    const { error: updateError } = await supabase
      .from('playthroughs')
      .update({
        apex_target: config.apexTarget || null,
        story_state: updatedState,
        updated_at: new Date().toISOString(),
      })
      .eq('id', playthroughId);

    setSaving(false);
    if (updateError) {
      console.error('Could not save game config', updateError);
      setError('Your configuration could not be saved.');
      return;
    }
    setOriginal({ ...config });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const selectClass =
    'min-h-11 w-full appearance-none rounded-lg border border-abyss-600/40 bg-abyss-900/60 px-3 py-2 text-sm text-pearl outline-none focus:border-abyss-400/60 disabled:opacity-50';

  return (
    <section className="glass-panel min-w-0 rounded-2xl p-4 sm:p-8">
      <div className="flex items-center gap-3 border-b border-abyss-700/30 pb-5 sm:pb-6">
        <SlidersHorizontal className="h-5 w-5 text-abyss-300/70" />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300/70">Setup</p>
          <h2 className="break-words font-display text-2xl font-semibold text-pearl sm:text-3xl">Game Configuration</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Change your apex, activate Kip, or enable the triad option. These shape which rules the narrator uses.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <p className="text-sm leading-relaxed text-amber-200/90">
          <span className="font-semibold text-amber-200">Warning:</span> If you activate or deactivate any of these after
          you have met the relevant NPC, you are at risk of severe AI drift. It is recommended not to change these
          settings once you have decided on them, or to instead go back to a previous save before meeting them.
        </p>
      </div>

      {authLoading || loading ? (
        <div className="mt-6 flex min-h-[8rem] items-center justify-center text-sm text-muted">Loading configuration...</div>
      ) : !user ? (
        <div className="mt-6 flex min-h-[8rem] flex-col items-center justify-center rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/25 px-6 text-center">
          <p className="text-sm text-muted">Sign in to change your game configuration.</p>
          <button onClick={onSignIn} className="mt-4 min-h-11 rounded-lg bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400">
            Sign in to continue
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {error && (
            <p className="rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-300">{error}</p>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-pearl">Apex</label>
            <p className="mb-3 text-xs leading-relaxed text-muted">
              The apex chosen at character creation is shown here. Only the four currently available apexes can be selected.
            </p>
            <div className="relative">
              <select
                value={config.apexTarget}
                onChange={(e) => setConfig((c) => ({ ...c, apexTarget: e.target.value }))}
                className={selectClass}
              >
                {availableApexes.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.name} — {a.species}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-abyss-700/30 bg-abyss-950/30 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-pearl">Kip (Translator NPC)</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Activate Kip to add the translator NPC to your story.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.kipActive}
              onClick={() => setConfig((c) => ({ ...c, kipActive: !c.kipActive }))}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                config.kipActive ? 'bg-abyss-500/80' : 'bg-abyss-700/50'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-pearl shadow transition-transform ${
                  config.kipActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="rounded-xl border border-abyss-700/30 bg-abyss-950/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-pearl">Triad Option</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Activates the triad rules from the rules tab, then select a triad character.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.triadActive}
                onClick={() => setConfig((c) => ({ ...c, triadActive: !c.triadActive }))}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                  config.triadActive ? 'bg-abyss-500/80' : 'bg-abyss-700/50'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-pearl shadow transition-transform ${
                    config.triadActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {config.triadActive && (
              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium text-pearl">Triad Character</label>
                <div className="relative">
                  <select
                    value={config.triadTarget}
                    onChange={(e) => setConfig((c) => ({ ...c, triadTarget: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">Select a triad character...</option>
                    {triadSurrogates.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save Configuration'}
            </button>
            {isDirty && !saving && (
              <button
                onClick={() => original && setConfig(original)}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-abyss-600/40 px-4 py-2.5 text-sm text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl"
              >
                Revert
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
