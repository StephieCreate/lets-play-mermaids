import { Type, Check, AlertTriangle } from 'lucide-react';
import { useFontSettings } from '@/context/FontSettingsContext';
import { FONT_OPTIONS, FONT_SIZE_OPTIONS, LINE_HEIGHT_OPTIONS } from '@/data/readingPreferences';

export default function FontSettingsPanel() {
  const { family, size, lineHeight, setFamily, setSize, setLineHeight, fontFamilyClass, fontPx, syncError } =
    useFontSettings();

  return (
    <section className="relative z-10">
      <div className="mx-auto max-w-3xl">
        <div className="glass-panel rounded-2xl p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <Type className="h-5 w-5 text-abyss-300/70" />
            <div>
              <h2 className="font-display text-xl font-semibold text-pearl sm:text-2xl">Reading Preferences</h2>
              <p className="mt-1 text-sm text-muted">
                Choose a comfortable font and text size for your story. Dyslexic-friendly options available.
                Your choices follow your account to any device you sign in on.
              </p>
            </div>
          </div>

          {syncError && (
            <p className="mb-6 flex items-center gap-2 rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {syncError}
            </p>
          )}

          {/* Font family selector */}
          <div className="mb-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-abyss-300/70">Story Font</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {FONT_OPTIONS.map((opt) => {
                const selected = family === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setFamily(opt.key)}
                    className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-all ${
                      selected
                        ? 'border-abyss-400/60 bg-abyss-500/20'
                        : 'border-abyss-700/30 bg-abyss-950/30 hover:border-abyss-300/40 hover:bg-abyss-800/40'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium text-pearl ${opt.className}`}>
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{opt.description}</span>
                      <span className={`mt-2 block text-sm text-pearl/80 ${opt.className}`}>
                        The tide pulls gently at the reef.
                      </span>
                    </span>
                    {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-abyss-200" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font size selector */}
          <div className="mb-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-abyss-300/70">Chat Text Size</p>
            <div className="grid grid-cols-5 gap-2">
              {FONT_SIZE_OPTIONS.map((opt) => {
                const selected = size === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSize(opt.key)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 transition-all ${
                      selected
                        ? 'border-abyss-400/60 bg-abyss-500/20'
                        : 'border-abyss-700/30 bg-abyss-950/30 hover:border-abyss-300/40 hover:bg-abyss-800/40'
                    }`}
                  >
                    <span
                      className={`${fontFamilyClass} leading-tight text-pearl`}
                      style={{ fontSize: opt.px }}
                    >
                      Aa
                    </span>
                    <span className={`text-[10px] ${selected ? 'text-pearl' : 'text-muted'}`}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Line spacing selector */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-abyss-300/70">Line Spacing</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {LINE_HEIGHT_OPTIONS.map((opt) => {
                const selected = lineHeight === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setLineHeight(opt.key)}
                    className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                      selected
                        ? 'border-abyss-400/60 bg-abyss-500/20'
                        : 'border-abyss-700/30 bg-abyss-950/30 hover:border-abyss-300/40 hover:bg-abyss-800/40'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-pearl">{opt.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">{opt.description}</span>
                    </span>
                    {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-abyss-200" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="mt-6 rounded-xl border border-abyss-700/30 bg-abyss-950/40 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-abyss-300/70">Preview</p>
            <p className={`text-pearl/90 ${fontFamilyClass}`} style={{ fontSize: fontPx }}>
              The dark water presses around you, cold and endless. Somewhere in the gloom, a shape moves —
              large, deliberate, watching. You feel the pull of the current before you see him emerge from the
              shadows, and the silence of the deep settles heavy against your gills.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
