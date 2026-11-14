import { useMemo, useState, useEffect } from 'react';
import { Anchor, ChevronDown, Waves, X, LockKeyhole, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { apexes, type Apex } from '@/data/apexes';
import { isCustomApexTarget, listCustomApexes, toCustomApexOption } from '@/lib/customApexes';

interface CharacterCreationModalProps {
  open: boolean;
  onClose: () => void;
  onSignIn: () => void;
  onStarted: (playthroughId: string) => void;
}

const presetEmojis = ['🧜‍♀️', '🧜', '🌊', '🐚', '🪸', '🫧', '⭐', '🌙', '🔮', '🦈', 'orca', ' Pearl'];

export default function CharacterCreationModal({ open, onClose, onSignIn, onStarted }: CharacterCreationModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🧜‍♀️');
  const [selectedApex, setSelectedApex] = useState<Apex | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customOptions, setCustomOptions] = useState<Apex[]>([]);

  const sortedApexes = useMemo(() => {
    return [...apexes, ...customOptions].sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return 0;
    });
  }, [customOptions]);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await listCustomApexes();
      if (!cancelled) setCustomOptions(data.map(toCustomApexOption));
    })();
    return () => { cancelled = true; };
  }, [open, user]);

  if (!open) return null;

  const canStart = name.trim().length > 0 && selectedApex !== null && selectedApex.available;

  const handleSelectApex = (apex: Apex) => {
    setSelectedApex(apex);
    setDropdownOpen(false);
  };

  const handleStart = async () => {
    if (!user) {
      onSignIn();
      return;
    }
    if (!canStart || !selectedApex) return;

    setSaving(true);
    setError(null);

    const { data: character, error: insertError } = await supabase
      .from('characters')
      .insert({ name: name.trim(), emoji, portrait_color: selectedApex.slug })
      .select('id')
      .single();

    if (insertError || !character) {
      console.error('Could not create character', insertError);
      setError('Your character could not be created. Please try again.');
      setSaving(false);
      return;
    }

    const { data: playthrough, error: playthroughError } = await supabase.from('playthroughs').insert({
      character_id: character.id,
      apex_target: selectedApex.slug,
      title: `${name.trim()} & ${selectedApex.name}`,
    }).select('id').single();

    if (playthroughError || !playthrough) {
      console.error('Could not create playthrough', playthroughError);
      setError('Your character was created but the story could not start. Please try again.');
      setSaving(false);
      return;
    }

    setSaving(false);
    setName('');
    setEmoji('🧜‍♀️');
    setSelectedApex(null);
    onClose();
    onStarted(playthrough.id);
  };

  const handleClose = () => {
    if (saving) return;
    setName('');
    setEmoji('🧜‍♀️');
    setSelectedApex(null);
    setError(null);
    setDropdownOpen(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-abyss-950/80 backdrop-blur-sm animate-fade-in" onClick={handleClose} />

      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-abyss-600/40 bg-gradient-to-b from-abyss-800/95 to-abyss-950/95 p-5 shadow-2xl shadow-abyss-950/80 sm:p-8 animate-fade-in-up">
        <button
          onClick={handleClose}
          disabled={saving}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-abyss-700/50 hover:text-pearl disabled:opacity-40"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2 text-abyss-300/70">
            <Waves className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.24em]">New Mermaid</span>
          </div>
          <h2 className="font-display text-3xl font-semibold text-pearl text-glow-soft sm:text-4xl">
            Create Your Character
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Name your mermaid, pick an organizing emoji, and choose the apex whose story you want to enter.
          </p>
        </div>

        <div className="space-y-6">
          {/* Name field */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-abyss-300/70">
              Character Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your mermaid's name..."
              maxLength={40}
              className="min-h-12 w-full rounded-xl border border-abyss-600/40 bg-abyss-900/60 px-4 py-3 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60 sm:text-base"
            />
          </div>

          {/* Emoji field */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-abyss-300/70">
              Emoji Marker
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {presetEmojis.map((em) => (
                <button
                  key={em}
                  onClick={() => setEmoji(em)}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border text-lg transition-all ${
                    emoji === em
                      ? 'border-abyss-300/50 bg-abyss-500/25 text-pearl'
                      : 'border-abyss-600/30 bg-abyss-950/30 text-muted hover:border-abyss-400/40 hover:text-pearl'
                  }`}
                >
                  {em}
                </button>
              ))}
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                placeholder="Custom"
                className="min-h-11 w-24 rounded-xl border border-abyss-600/40 bg-abyss-900/60 px-3 py-2 text-sm text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60"
              />
            </div>
          </div>

          {/* Apex selector */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-abyss-300/70">
              Choose Your Apex
            </label>
            <div className="relative">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-abyss-600/40 bg-abyss-900/60 px-4 py-3 text-left transition-colors hover:border-abyss-400/50"
              >
                {selectedApex ? (
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="font-medium text-pearl">{selectedApex.name}</span>
                    <span className="text-xs text-muted">{selectedApex.species}</span>
                    {!selectedApex.available && (
                      <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-300">
                        In dev
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-sm text-muted/60">Select an apex...</span>
                )}
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-abyss-600/40 bg-abyss-900/95 shadow-xl shadow-abyss-950/60 backdrop-blur-sm">
                  {sortedApexes.map((apex) => (
                    <button
                      key={apex.slug}
                      onClick={() => handleSelectApex(apex)}
                      className="flex w-full items-center justify-between gap-3 border-b border-abyss-700/30 px-4 py-3 text-left transition-colors last:border-0 hover:bg-abyss-700/40"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-pearl">{apex.name}</span>
                        <span className="block text-xs text-muted">{apex.species}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                        isCustomApexTarget(apex.slug)
                          ? 'border border-abyss-300/30 bg-abyss-500/15 text-abyss-200'
                          : apex.available
                            ? 'border border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
                            : 'border border-amber-400/30 bg-amber-500/10 text-amber-300'
                      }`}>
                        {isCustomApexTarget(apex.slug) ? 'Custom' : apex.available ? 'Available' : 'In dev'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Lore reveal */}
          {selectedApex && (
            <div className="rounded-xl border border-abyss-600/30 bg-abyss-950/35 p-5 animate-fade-in">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="font-display text-xl font-semibold text-pearl">{selectedApex.name}</h3>
                <span className="text-sm italic text-abyss-100/70">{selectedApex.epithet}</span>
              </div>
              <p className="text-sm leading-relaxed text-muted">{selectedApex.lore}</p>
            </div>
          )}

          {/* Not-available notice */}
          {selectedApex && !selectedApex.available && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <p className="text-sm leading-relaxed text-amber-200/90">
                This apex is still in development. You can read the lore, but the story cannot begin yet.
              </p>
            </div>
          )}

          {/* Sign-in notice */}
          {!user && (
            <div className="flex items-start gap-3 rounded-xl border border-abyss-500/30 bg-abyss-700/20 p-4">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-abyss-300/70" />
              <p className="text-sm leading-relaxed text-muted">
                Sign in to save your character and begin your story.
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-300">{error}</p>
          )}

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={!canStart || saving}
            className="group relative flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-8 py-4 text-base font-semibold text-pearl shadow-lg shadow-abyss-900/50 transition-all hover:from-abyss-400 hover:to-abyss-300 hover:text-glow disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:from-abyss-500 disabled:hover:to-abyss-400"
          >
            <Anchor className="h-5 w-5 transition-transform group-hover:-rotate-12" />
            {saving ? 'Diving in...' : 'Start Game'}
          </button>
          {!canStart && !saving && (
            <p className="text-center text-xs text-muted/60">
              {selectedApex && !selectedApex.available
                ? 'This apex is not available yet.'
                : 'Enter a name and choose an apex to begin.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
