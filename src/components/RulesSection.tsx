import { ArrowRight, BookOpen, Waves } from 'lucide-react';

interface RulesSectionProps {
  onOpenRules: () => void;
}

export default function RulesSection({ onOpenRules }: RulesSectionProps) {
  return (
    <section id="rules" className="relative z-10 mx-auto max-w-5xl px-4 py-24 sm:px-6 lg:px-8">
      <button
        onClick={onOpenRules}
        className="glass-panel glass-panel-hover group w-full rounded-2xl p-6 text-left transition-all sm:p-8"
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-abyss-700/40 text-abyss-200">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300/70">
                <Waves className="h-3.5 w-3.5" />
                The Codex
              </div>
              <h2 className="font-display text-2xl font-semibold text-pearl sm:text-3xl">Explore the Game Rules</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
                Enter the rules archive and learn how survival, romance, and the dark ocean shape every story.
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-abyss-200 transition-colors group-hover:text-pearl">
            Open rules
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </button>
    </section>
  );
}
