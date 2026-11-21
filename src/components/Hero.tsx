import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function Hero() {
  const { user } = useAuth();
  const [welcomeOpen, setWelcomeOpen] = useState(!user);

  // Collapse automatically for returning signed-in players; expand for new visitors
  useEffect(() => {
    setWelcomeOpen(!user);
  }, [user]);

  return (
    <section id="hero" className="relative px-4 pt-4 pb-2 sm:pt-8 sm:pb-4">
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {/* Subtle static divider */}
        <div className="mb-3 flex justify-center">
          <div className="h-px w-24 bg-gradient-to-r from-transparent via-abyss-400/50 to-transparent" />
        </div>

        {/* Title */}
        <h1 className="font-display text-3xl font-bold leading-tight text-pearl sm:text-5xl lg:text-6xl">
          <span className="block text-glow">Let's Play Mermaids</span>
          <span className="mt-1.5 block text-base font-normal italic text-abyss-100/80 sm:mt-2 sm:text-xl lg:text-2xl">
            A Dark Ocean Survival Romance RPG
          </span>
        </h1>

        {/* Collapsible Welcome Survival Guide */}
        <div className="mx-auto mt-5 max-w-2xl text-left">
          <div className="glass-panel overflow-hidden rounded-2xl">
            <button
              type="button"
              onClick={() => setWelcomeOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-abyss-800/30 sm:px-5"
              aria-expanded={welcomeOpen}
            >
              <span className="font-display text-sm font-medium tracking-wide text-abyss-100 sm:text-base">
                Welcome to the Deep — Survival Guide
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-abyss-300 transition-transform duration-200 ${
                  welcomeOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {welcomeOpen && (
              <div className="border-t border-abyss-700/30 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                <p className="text-xs leading-relaxed text-muted sm:text-sm">
                  Welcome to Let's Play Mermaids, a Dark Ocean Survival RPG! While this game is
                  facilitated by AI, the world you are about to enter is governed by real-world
                  marine biology. The ocean is beautiful, but it is incredibly dangerous. As you
                  play, I highly encourage you to research the creatures you encounter, the biomes
                  you explore, and the real-world fish you choose to play as. Your choices matter
                  here, and understanding the real-world food chain will be your greatest tool for
                  survival.
                </p>
                <p className="mt-2.5 text-xs leading-relaxed text-abyss-100/80 sm:text-sm">
                  Dive deep, learn about our incredible oceans, and good luck navigating the dark
                  water!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}