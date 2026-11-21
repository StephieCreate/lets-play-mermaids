import { useState, useCallback, useEffect } from 'react';
import { Key, Type, Shield, Bug, Sparkles, Check, Compass, MessageCircle } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { FontSettingsProvider } from '@/context/FontSettingsContext';
import OceanBackground from '@/components/OceanBackground';
import Header, { type AppTab } from '@/components/Header';
import Hero from '@/components/Hero';
import CharacterRoster from '@/components/CharacterRoster';
import RulesPage from '@/components/RulesPage';
import CharacterCreationModal from '@/components/CharacterCreationModal';
import PlayScreen from '@/components/PlayScreen';
import Footer from '@/components/Footer';
import AuthModal from '@/components/AuthModal';
import FontSettingsPanel from '@/components/FontSettingsPanel';
import CustomApexPanel from '@/components/CustomApexPanel';
import AIConfiguration from '@/components/AIConfiguration';
import BugReportModal from '@/components/BugReportModal';
import UserSettingsModal from '@/components/UserSettingsModal';
import PasswordUpdateModal from '@/components/PasswordUpdateModal';
import Toast from '@/components/Toast';

type SettingsSubTab = 'ai-config' | 'display' | 'account';

// Temporary static feed moved from Hero.tsx — Ticket 2 will swap this for live `public.news_posts` + Admin Post Creator.
const INITIAL_NEWS_POSTS = [
  {
    id: 'phase-5',
    phase: 'Phase 5',
    title: 'Live Playtesting, Status Bars & Cartridge Hub',
    content:
      'The app is officially published and live for Discord playtesters, with full backend API key encryption locked in. New Feature Alert: Interactive status bars (Stm, HP, Lvl, and Bond) are now live at the top of the play screen! Since this is brand-new, please keep an eye on them to make sure they update smoothly with your turns—you can tap any pill to manually adjust your numbers or hit Sync from Save & Chat if they ever drift, and report any hiccups. Next up is an in-app Store section so playtesters can always grab the most current game cartridge file as mechanics are tuned. Down the road, it will include an optional "Pay What You Want" (up to $15) button to support development, though checkout won\'t be wired up until much later.',
  },
  {
    id: 'phase-4',
    phase: 'Phase 4',
    title: 'Apexes Needing Testing',
    content:
      'Apexes are currently tested for female player characters under 9 ft: Kial, Severin, Ezra, and Malibu. All other sizes and gender ranges have not been tested for any Apexes yet. Ricsa and Idris still need extensive playtesting to determine whether they are stable or need Dev adjustments—Idris features a unique new mechanic in the Game Master system, and Ricsa pushes the waystation mechanics to their limits. Akuma and Vanna are currently being brainstormed and should be up within a month or two. Playtesters can message Stephie directly on Discord or use the in-app bug reporting button!',
  },
  {
    id: 'phase-3',
    phase: 'Phase 3',
    title: 'Tetris Bag RNG & Markov Weather Active',
    content:
      'Replaced raw d20/d10 rolls with the Tetris Bag encounter deck and Markov Weather Fronts to ensure smooth meteorological transitions and eliminate 5-day death spirals.',
  },
  {
    id: 'phase-2',
    phase: 'Phase 2',
    title: 'Multi-Model AI Configuration & Cost Estimator',
    content:
      'Added a BYOK cost estimator widget, local AI support (Ollama/LM Studio via Custom endpoints), and key-specific model preference dropdowns.',
  },
  {
    id: 'phase-1',
    phase: 'Phase 1',
    title: 'Initial Alpha Launch',
    content:
      'Core rules integration, Grotto Registry splits, and robust DeepSeek Pro baseline logic fully established. Welcome to the deep ocean!',
  },
];

const READ_NEWS_STORAGE_KEY = 'mermaids_read_news_ids';

function loadReadNewsIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_NEWS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function AppContent() {
  const { user, isPasswordRecovery, clearPasswordRecovery, isPasswordExpired } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [creationModalOpen, setCreationModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'home' | 'play'>('home');
  const [activeTab, setActiveTab] = useState<AppTab>('characters');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('ai-config');
  const [activePlaythroughId, setActivePlaythroughId] = useState<string | null>(null);
  const [rosterRefreshKey, setRosterRefreshKey] = useState(0);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);
  const [rotationPromptOpen, setRotationPromptOpen] = useState(false);
  const [rotationPromptSeen, setRotationPromptSeen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [readNewsIds, setReadNewsIds] = useState<string[]>(loadReadNewsIds);

  const hasUnreadNews = INITIAL_NEWS_POSTS.some((post) => !readNewsIds.includes(post.id));

  const markNewsRead = useCallback((id: string) => {
    setReadNewsIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      localStorage.setItem(READ_NEWS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const markAllNewsRead = useCallback(() => {
    const allIds = INITIAL_NEWS_POSTS.map((p) => p.id);
    setReadNewsIds(allIds);
    localStorage.setItem(READ_NEWS_STORAGE_KEY, JSON.stringify(allIds));
  }, []);

  // Apply persisted Jellyfish Cursor preference on mount
  useEffect(() => {
    const enabled = localStorage.getItem('mermaids_jellyfish_cursor') === 'true';
    document.documentElement.classList.toggle('jellyfish-cursor-active', enabled);
  }, []);

  // 90-day rotation nudge: once per session, when the password is expired.
  useEffect(() => {
    if (user && isPasswordExpired && !rotationPromptSeen) {
      setRotationPromptOpen(true);
      setRotationPromptSeen(true);
    }
  }, [user, isPasswordExpired, rotationPromptSeen]);

  const handleCreateCharacter = useCallback(() => {
    setCreationModalOpen(true);
  }, []);

  const handleSelectTab = useCallback((tab: AppTab) => {
    setCurrentView('home');
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const dismissToast = useCallback(() => setToastMessage(null), []);

  const handleBugReportSubmitted = useCallback(() => {
    setToastMessage('Bug reported successfully!');
  }, []);

  useEffect(() => {
    document.title =
      currentView === 'play' ? 'Playing | Mermaids' : "Let's Play Mermaids";
  }, [currentView]);

  return (
    <div className="relative min-h-screen">
      <OceanBackground />

      {currentView !== 'play' && (
        <Header
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          onSignIn={() => setAuthModalOpen(true)}
          onReportBug={() => setBugReportOpen(true)}
          hasUnreadNews={hasUnreadNews}
        />
      )}

      {currentView === 'play' && activePlaythroughId ? (
        <PlayScreen
          playthroughId={activePlaythroughId}
          onBack={() => {
            setCurrentView('home');
            setActivePlaythroughId(null);
          }}
          onSignIn={() => setAuthModalOpen(true)}
          onReportBug={() => setBugReportOpen(true)}
        />
      ) : (
        <div className="relative z-10 flex min-h-screen flex-col pt-14 pb-20 md:pl-60 md:pt-0 md:pb-0">
          <main className="flex-1">
            {activeTab === 'characters' && <Hero />}

            <div className="mx-auto max-w-5xl px-4 pt-4 pb-12 sm:px-6 lg:px-8">
              {activeTab === 'characters' && (
                <CharacterRoster
                  onCreateCharacter={handleCreateCharacter}
                  onResumePlaythrough={(playthroughId) => {
                    setActivePlaythroughId(playthroughId);
                    setCurrentView('play');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onSignIn={() => setAuthModalOpen(true)}
                  refreshKey={rosterRefreshKey}
                />
              )}

              {activeTab === 'rules' && (
                <RulesPage
                  onBack={() => handleSelectTab('characters')}
                  onSignIn={() => setAuthModalOpen(true)}
                  embedded
                />
              )}

              {activeTab === 'custom-apex' && (
                <CustomApexPanel onSignIn={() => setAuthModalOpen(true)} />
              )}

              {/* WORLD LORE SHELL — Ready for Ticket 4 backend & editor wiring */}
              {activeTab === 'world-lore' && (
                <section className="mx-auto max-w-3xl space-y-6 py-4">
                  <div className="text-center">
                    <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300">
                      <Compass className="h-4 w-4" />
                      <span>Atlas of the Abyss</span>
                    </div>
                    <h2 className="font-display text-3xl font-bold text-pearl sm:text-4xl">
                      World Lore
                    </h2>
                    <p className="mt-2 text-sm text-muted">
                      Biomes, currents, merfolk culture, and deep-water field notes.
                    </p>
                  </div>

                  <div className="glass-panel rounded-2xl p-6 text-center sm:p-8">
                    <p className="text-sm leading-relaxed text-muted">
                      The interactive World Lore codex, Table of Contents sidebar, collapsible
                      sections, and image gallery will connect here once Ticket 4 is wired up.
                    </p>
                  </div>
                </section>
              )}

              {/* NEWS & UPDATES SHELL — Ready for Ticket 2 `public.news_posts` & Admin Post Creator */}
              {activeTab === 'news' && (
                <section className="mx-auto max-w-3xl space-y-5 py-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <div className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300">
                        <Sparkles className="h-4 w-4 text-foam-400" />
                        <span>Alpha / Beta Phase Log</span>
                      </div>
                      <h2 className="font-display text-3xl font-bold text-pearl sm:text-4xl">
                        News &amp; Updates
                      </h2>
                    </div>

                    {hasUnreadNews && (
                      <button
                        type="button"
                        onClick={markAllNewsRead}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-abyss-400/35 bg-abyss-500/25 px-3.5 py-2 text-xs font-medium text-pearl transition-all hover:bg-abyss-500/40"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Mark All as Read</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    {INITIAL_NEWS_POSTS.map((post) => {
                      const isUnread = !readNewsIds.includes(post.id);
                      return (
                        <article
                          key={post.id}
                          className={`glass-panel rounded-2xl p-5 transition-all sm:p-6 ${
                            isUnread ? 'border-coral-500/40' : ''
                          }`}
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-abyss-400/30 bg-abyss-800/60 px-2.5 py-0.5 font-mono text-[11px] text-abyss-200">
                                {post.phase}
                              </span>
                              {isUnread && (
                                <span className="rounded-full bg-coral-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-coral-300 ring-1 ring-coral-500/40">
                                  New
                                </span>
                              )}
                            </div>

                            {isUnread && (
                              <button
                                type="button"
                                onClick={() => markNewsRead(post.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-abyss-400/30 bg-abyss-700/30 px-2.5 py-1 text-xs font-medium text-pearl transition-colors hover:bg-abyss-600/40"
                              >
                                <Check className="h-3 w-3" />
                                <span>Read</span>
                              </button>
                            )}
                          </div>

                          <h3 className="font-display text-lg font-semibold text-pearl sm:text-xl">
                            {post.title}
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-muted">
                            {post.content}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* PLAYER SETTINGS UMBRELLA HUB */}
              {activeTab === 'settings' && (
                <section className="mx-auto max-w-3xl space-y-6 py-4">
                  <div className="text-center">
                    <h2 className="font-display text-3xl font-bold text-pearl sm:text-4xl">
                      Player Settings
                    </h2>
                    <p className="mt-1.5 text-sm text-muted">
                      Manage your AI keys, reading experience, and account security.
                    </p>
                  </div>

                  {/* 3 Sub-Pills */}
                  <div className="glass-panel mx-auto flex max-w-xl items-center gap-1.5 rounded-2xl p-1.5">
                    <button
                      type="button"
                      onClick={() => setSettingsSubTab('ai-config')}
                      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:text-sm ${
                        settingsSubTab === 'ai-config'
                          ? 'bg-abyss-500/35 text-pearl shadow-sm'
                          : 'text-muted hover:bg-abyss-800/40 hover:text-pearl'
                      }`}
                    >
                      <Key className="h-4 w-4 shrink-0" />
                      <span>AI Config</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSettingsSubTab('display')}
                      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:text-sm ${
                        settingsSubTab === 'display'
                          ? 'bg-abyss-500/35 text-pearl shadow-sm'
                          : 'text-muted hover:bg-abyss-800/40 hover:text-pearl'
                      }`}
                    >
                      <Type className="h-4 w-4 shrink-0" />
                      <span>Display</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSettingsSubTab('account')}
                      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-medium transition-all sm:text-sm ${
                        settingsSubTab === 'account'
                          ? 'bg-abyss-500/35 text-pearl shadow-sm'
                          : 'text-muted hover:bg-abyss-800/40 hover:text-pearl'
                      }`}
                    >
                      <Shield className="h-4 w-4 shrink-0" />
                      <span>Account</span>
                    </button>
                  </div>

                  {/* Sub-Pill Content */}
                  {settingsSubTab === 'ai-config' && (
                    <AIConfiguration onSignIn={() => setAuthModalOpen(true)} />
                  )}

                  {settingsSubTab === 'display' && <FontSettingsPanel />}

                  {settingsSubTab === 'account' && (
                    <div className="space-y-4">
                      <div className="glass-panel rounded-2xl p-5 sm:p-6">
                        <h3 className="font-display text-xl font-semibold text-pearl">
                          Account &amp; Security
                        </h3>
                        <p className="mt-1.5 text-sm text-muted">
                          {user
                            ? `Signed in as ${user.email}. Manage password rotation, key protection, or account deletion.`
                            : 'Sign in to manage your account security and saved progress.'}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {user ? (
                            <button
                              type="button"
                              onClick={() => setUserSettingsOpen(true)}
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-4 py-2 text-sm font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300"
                            >
                              <Shield className="h-4 w-4" />
                              <span>Open Security &amp; Danger Zone</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAuthModalOpen(true)}
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-4 py-2 text-sm font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300"
                            >
                              <span>Sign In</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setBugReportOpen(true)}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-abyss-400/30 bg-abyss-800/40 px-4 py-2 text-sm font-medium text-pearl transition-colors hover:bg-abyss-700/50"
                          >
                            <Bug className="h-4 w-4" />
                            <span>Report a Bug</span>
                          </button>
                          <a
  href="https://discord.gg/G5DbenAjJ"
  target="_blank"
  rel="noopener noreferrer"
  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-4 py-2 text-sm font-medium text-indigo-200 transition-colors hover:border-indigo-300/50 hover:bg-indigo-500/25 hover:text-pearl"
>
  <MessageCircle className="h-4 w-4" />
  <span>Join us on Discord</span>
</a>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>
          </main>
          <Footer />
        </div>
      )}

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      <UserSettingsModal
        open={userSettingsOpen}
        onClose={() => setUserSettingsOpen(false)}
        onOpenAIConfig={() => {
          setUserSettingsOpen(false);
          setCurrentView('home');
          setActiveTab('settings');
          setSettingsSubTab('ai-config');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      <PasswordUpdateModal
        open={isPasswordRecovery}
        mandatory
        onClose={() => clearPasswordRecovery()}
        title="Set a New Password"
        description="You opened a password recovery link. Choose a new password to regain access to your account."
      />
      <PasswordUpdateModal
        open={rotationPromptOpen && !isPasswordRecovery}
        onClose={() => setRotationPromptOpen(false)}
        title="90-Day Password Rotation"
        description="Your password has reached the 90-day security rotation limit. Update it now to keep your account secure."
      />
      <BugReportModal
        open={bugReportOpen}
        playthroughId={currentView === 'play' ? activePlaythroughId : null}
        onClose={() => setBugReportOpen(false)}
        onSubmitted={handleBugReportSubmitted}
      />
      <Toast message={toastMessage} onDismiss={dismissToast} />
      <CharacterCreationModal
        open={creationModalOpen}
        onClose={() => setCreationModalOpen(false)}
        onSignIn={() => {
          setCreationModalOpen(false);
          setAuthModalOpen(true);
        }}
        onStarted={(playthroughId) => {
          setRosterRefreshKey((k) => k + 1);
          setActivePlaythroughId(playthroughId);
          setCurrentView('play');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FontSettingsProvider>
        <AppContent />
      </FontSettingsProvider>
    </AuthProvider>
  );
}