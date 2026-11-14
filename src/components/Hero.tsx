import { Waves, Sparkles } from 'lucide-react';

export default function Hero() {
  return (
    <section id="hero" className="relative flex min-h-[100svh] flex-col items-center justify-center px-4 pt-20 pb-4">
      <div className="relative z-10 mx-auto max-w-4xl text-center">
        {/* Decorative wave divider */}
        <div className="mb-4 flex justify-center animate-fade-in sm:mb-6">
          <div className="flex items-center gap-3 text-abyss-300/60">
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-abyss-400/40 sm:w-16" />
            <Waves className="h-5 w-5 animate-wave-slow" />
            <span className="h-px w-12 bg-gradient-to-l from-transparent to-abyss-400/40 sm:w-16" />
          </div>
        </div>

        {/* Title */}
        <h1 className="font-display text-3xl font-bold leading-tight text-pearl animate-fade-in-up sm:text-6xl lg:text-7xl">
          <span className="block text-glow">Let's Play Mermaids</span>
          <span className="mt-2 block text-lg font-normal italic text-abyss-100/80 sm:mt-3 sm:text-2xl lg:text-3xl animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            A Dark Ocean Survival Romance RPG
          </span>
        </h1>

        {/* Welcome message */}
        <div className="mx-auto mt-6 max-w-2xl animate-fade-in-up sm:mt-8" style={{ animationDelay: '0.4s' }}>
          <div className="glass-panel rounded-2xl p-4 text-left sm:p-6">
            <p className="text-xs leading-relaxed text-muted sm:text-base">
              Welcome to Let's Play Mermaids, a Dark Ocean Survival RPG! While this game is
              facilitated by AI, the world you are about to enter is governed by real-world
              marine biology. The ocean is beautiful, but it is incredibly dangerous. As you
              play, I highly encourage you to research the creatures you encounter, the biomes
              you explore, and the real-world fish you choose to play as. Your choices matter
              here, and understanding the real-world food chain will be your greatest tool for
              survival.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-abyss-100/80 sm:mt-3 sm:text-base">
              Dive deep, learn about our incredible oceans, and good luck navigating the dark water!
            </p>
          </div>
        </div>

        {/* --- UPDATED ALPHA/BETA PHASE LOG --- */}
        <div className="mx-auto mt-4 max-w-2xl animate-fade-in-up sm:mt-6 text-left" style={{ animationDelay: '0.6s' }}>
          <div className="glass-panel rounded-2xl p-4 border border-abyss-600/30 bg-abyss-950/40 sm:p-6">
            <div className="flex items-center gap-2 border-b border-abyss-700/30 pb-3 mb-4">
              <Sparkles className="h-4 w-4 text-foam-400" />
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-pearl sm:text-base">
                Updates Alpha/Beta Phase
              </h3>
            </div>

            {/* Scrollable Updates Container */}
            <div className="max-h-48 overflow-y-auto pr-2 space-y-4 custom-scrollbar text-xs sm:text-sm text-muted">
              
              <div>
                <div className="border-t border-abyss-800/40 pt-3">
                <div className="flex justify-between items-center text-pearl font-medium mb-1">
                  <span>Apexes Needing Testing</span>
                  <span className="text-[10px] font-mono text-abyss-300">Phase 5</span>
                </div>
                <p className="leading-relaxed">
                  Apexes are currently tested for female player characters under 9 ft: Kial, Severin, Ezra, and Mailbu. All other sizes and gender ranges have not been tested for any apexes yet. Ricsa and Idris have not been tested yet and need extensive playtesting to determine whether they are stable or need Dev adjustments. Idris features a new mechanic unique to his apex in the game master system. Ricsa pushes the waystation mechanics to their limits. Both need reporting and testing. If you are playing right now as a playtester, you may message Stephie directly through Discord or use the bug reporting feature. Akuma and Vanna are currently being brainstormed and should be up within a month or two. app will be published by the end of November, when Bolt tokens are reset to address security issues before going live for api keys. Don't worry; they are currently secure because the app isn't public. This is an extra precaution.
                </p>
              </div>
                
                <div className="flex justify-between items-center text-pearl font-medium mb-1">
                  <span>Tetris Bag RNG & Markov Weather Active</span>
                  <span className="text-[10px] font-mono text-abyss-300">Phase 3</span>
                </div>
                <p className="leading-relaxed">
                  Replaced raw d20/d10 rolls with the Tetris Bag encounter deck and Markov Weather Fronts to ensure smooth meteorological transitions and eliminate 5-day death spirals.
                </p>
              </div>

              <div className="border-t border-abyss-800/40 pt-3">
                <div className="flex justify-between items-center text-pearl font-medium mb-1">
                  <span>Multi-Model AI Configuration & Cost Estimator</span>
                  <span className="text-[10px] font-mono text-abyss-300">Phase 2</span>
                </div>
                <p className="leading-relaxed">
                  Added a BYOK cost estimator widget, local AI support (Ollama/LM Studio via Custom endpoints), and key-specific model preference dropdowns.
                </p>
              </div>

              <div className="border-t border-abyss-800/40 pt-3">
                <div className="flex justify-between items-center text-pearl font-medium mb-1">
                  <span>Initial Alpha Launch</span>
                  <span className="text-[10px] font-mono text-abyss-300">Phase 1</span>
                </div>
                <p className="leading-relaxed">
                  Core rules integration, Grotto Registry splits, and robust DeepSeek Pro baseline logic fully established. Welcome to the deep ocean!
                </p>
              </div>
            
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}