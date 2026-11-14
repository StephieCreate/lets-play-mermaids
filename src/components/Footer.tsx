import { Waves, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-abyss-700/20 bg-abyss-950/50">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <Waves className="h-5 w-5 text-abyss-300/60 animate-wave-slow" />
            <span className="font-display text-lg text-pearl/80">Let's Play Mermaids</span>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            Crafted with
            <Heart className="h-3.5 w-3.5 text-coral-500/70" />
            in the dark ocean
          </p>
        </div>
        <p className="mt-6 text-center text-xs text-muted/50">
          A Dark Ocean Survival Romance RPG
        </p>
      </div>
    </footer>
  );
}
