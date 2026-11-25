import { useState, useCallback, useEffect } from 'react';
import { Key, Type, Shield, Bug, Sparkles, Check, MessageCircle } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
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
import NewsPanel, { type NewsPost } from '@/components/NewsPanel';
import WorldLorePage from '@/components/WorldLorePage';
import { INSTALLED_VERSION_KEY, normalizeVersion } from '@/lib/gameCartridge';

type SettingsSubTab = 'ai-config' | 'display' | 'account';

const READ_NEWS_STORAGE_KEY = 'mermaids_read_news_ids';
const NEWS_LAST_READ_KEY = 'mermaids_news_last_read_at';

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

function loadNewsLastReadAt(): string | null {
  try {
    return localStorage.getItem(NEWS_LAST_READ_KEY);
  } catch {
    return null;
  }
}

function AppContent() {
  const { user, isPasswordRecovery, clearPasswordRecovery, isPasswordExpired, isAdmin } = useAuth();
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
  const [newsLastReadAt, setNewsLastReadAt] = useState<string | null>(loadNewsLastReadAt);
  const [newsPosts, setNewsPosts] = useState<NewsPost[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [latestStoreVersion, setLatestStoreVersion] = useState<string | null>(null);
  const [installedCartridgeVersion, setInstalledCartridgeVersion] = useState<string | null>(null);

  const isRulesLockedView = currentView !== 'play' && activeTab === 'rules';

  const hasUnreadNews = newsPosts.some(
    (post) =>
      !readNewsIds.includes(post.id) &&
      (!newsLastReadAt || new Date(post.created_at).getTime() > new Date(newsLastReadAt).getTime()),
  );

  const fetchNewsPosts = useCallback(async () => {
    setNewsLoading(true);
    setNewsError(null);
    const { data, error: fetchError } = await supabase
      .from('news_posts')
      .select('id, slug, phase, title, content, created_at, created_by, author_name')
      .order('created_at', { ascending: false });
    if (fetchError) {
      console.error('Failed to load news posts', fetchError);
      setNewsError('The news could not be loaded. Please try again.');
    } else {
      setNewsPosts((data ?? []) as NewsPost[]);
    }
    setNewsLoading(false);
  }, []);

  useEffect(() => {
    void fetchNewsPosts();
  }, [fetchNewsPosts]);

  // Track the active store cartridge version vs. the player's installed version
  const fetchCartridgeStatus = useCallback(async () => {
    const { data } = await supabase
      .from('store_cartridges')
      .select('version')
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatestStoreVersion((data?.version as string | undefined) ?? null);
    try {
      setInstalledCartridgeVersion(localStorage.getItem(INSTALLED_VERSION_KEY));
    } catch {
      setInstalledCartridgeVersion(null);
    }
  }, []);

  useEffect(() => {
    void fetchCartridgeStatus();
  }, [fetchCartridgeStatus, user?.id]);

  // Prefer the newer of account-synced and local installed versions — a stale
  // older value must never regress the other source of truth.
  useEffect(() => {
    const meta = user?.user_metadata?.installed_cartridge_version;
    if (typeof meta !== 'string' || !normalizeVersion(meta)) return;
    const metaSegments = normalizeVersion(meta).split('.').map((part) => parseInt(part, 10) || 0);
    const localSegments = normalizeVersion(installedCartridgeVersion)
      .split('.')
      .map((part) => parseInt(part, 10) || 0);
    const len = Math.max(metaSegments.length, localSegments.length);
    let metaNewerOrEqual = true;
    for (let i = 0; i < len; i++) {
      const diff = (metaSegments[i] ?? 0) - (localSegments[i] ?? 0);
      if (diff !== 0) {
        metaNewerOrEqual = diff > 0;
        break;
      }
    }
    if (metaNewerOrEqual) {
      setInstalledCartridgeVersion(normalizeVersion(meta));
    }
  }, [user, installedCartridgeVersion]);

  // Clear/update the Rules badge the instant a cartridge is installed or published
  useEffect(() => {
    const handleCartridgeUpdated = () => {
      void fetchCartridgeStatus();
    };
    window.addEventListener('mermaids_cartridge_updated', handleCartridgeUpdated);
    return () => window.removeEventListener('mermaids_cartridge_updated', handleCartridgeUpdated);
  }, [fetchCartridgeStatus]);

  const hasRulesUpdate = Boolean(
    user && latestStoreVersion && normalizeVersion(latestStoreVersion) !== normalizeVersion(installedCartridgeVersion)
  );

  // Merge locally-stored read IDs with the account's synced list on sign-in
  useEffect(() => {
    if (!user) return;
    const accountReadIds = Array.isArray(user.user_metadata?.read_news_ids)
      ? (user.user_metadata.read_news_ids as string[])
      : [];
    const merged = Array.from(new Set([...loadReadNewsIds(), ...accountReadIds]));
    if (merged.length > accountReadIds.length) {
      localStorage.setItem(READ_NEWS_STORAGE_KEY, JSON.stringify(merged));
      setReadNewsIds(merged);
      void supabase.auth.updateUser({ data: { read_news_ids: merged } });
    } else if (merged.length > loadReadNewsIds().length) {
      localStorage.setItem(READ_NEWS_STORAGE_KEY, JSON.stringify(merged));
      setReadNewsIds(merged);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Watermark sync: take the NEWER of account metadata vs. localStorage so a
  // sign-in can never regress the read-all state to an older timestamp.
  useEffect(() => {
    if (!user) return;
    const meta = user?.user_metadata?.last_read_news_at;
    const metaTime = typeof meta === 'string' && meta ? new Date(meta).getTime() : 0;
    const localTime = newsLastReadAt ? new Date(newsLastReadAt).getTime() : 0;
    if (Number.isNaN(metaTime) ? false : metaTime > localTime) {
      setNewsLastReadAt(meta);
      try {
        localStorage.setItem(NEWS_LAST_READ_KEY, meta);
      } catch {
        // localStorage unavailable; state still applied for this session
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const persistReadIds = (next: string[]) => {
    localStorage.setItem(READ_NEWS_STORAGE_KEY, JSON.stringify(next));
    setReadNewsIds(next);
    if (user) {
      void supabase.auth.updateUser({ data: { read_news_ids: next } });
    }
  };

  const persistNewsLastReadAt = (timestamp: string) => {
    setNewsLastReadAt(timestamp);
    try {
      localStorage.setItem(NEWS_LAST_READ_KEY, timestamp);
    } catch {
      // localStorage unavailable; state still applied for this session
    }
    if (user) {
      void supabase.auth.updateUser({ data: { last_read_news_at: timestamp } });
    }
  };

  const markNewsRead = useCallback((id: string) => {
    setReadNewsIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      persistReadIds(next);
      // Reading the final unread post counts as read-all: stamp the watermark
      if (
        newsPosts.length > 0 &&
        newsPosts.every((post) => next.includes(post.id))
      ) {
        const newest = newsPosts.reduce<string>(
          (max, post) => (post.created_at > max ? post.created_at : max),
          newsPosts[0].created_at,
        );
        persistNewsLastReadAt(new Date(new Date(newest).getTime() + 1000).toISOString());
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, newsPosts]);

  const markAllNewsRead = useCallback(() => {
    persistReadIds(newsPosts.map((p) => p.id));
    // Watermark at newest post + 1s so server clock skew never re-flags it
    const newest = newsPosts.reduce<string | null>(
      (max, post) => (max === null || post.created_at > max ? post.created_at : max),
      null,
    );
    if (newest) {
      const stamp = new Date(new Date(newest).getTime() + 1000).toISOString();
      persistNewsLastReadAt(stamp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, newsPosts]);

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
    <div className={isRulesLockedView ? 'relative h-[100dvh] overflow-hidden' : 'relative min-h-screen'}>
      <OceanBackground />

      {currentView !== 'play' && (
        <Header
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          onSignIn={() => setAuthModalOpen(true)}
          onReportBug={() => setBugReportOpen(true)}
          hasUnreadNews={hasUnreadNews}
          hasRulesUpdate={hasRulesUpdate}
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
      ) : isRulesLockedView ? (
        <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden pt-14 pb-20 md:pl-60 md:pt-0 md:pb-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <RulesPage
              onBack={() => handleSelectTab('characters')}
              onSignIn={() => setAuthModalOpen(true)}
              hasRulesUpdate={hasRulesUpdate}
              embedded
            />
          </div>
        </div>
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

              {activeTab === 'custom-apex' && (
                <CustomApexPanel onSignIn={() => setAuthModalOpen(true)} />
              )}

              {/* WORLD LORE — live `public.world_lore_content` codex + admin rich-text editor */}
              {activeTab === 'world-lore' && (
                <WorldLorePage onSignIn={() => setAuthModalOpen(true)} />
              )}

              {/* NEWS & UPDATES — live `public.news_posts` feed + Admin Post Creator */}
              {activeTab === 'news' && (
                <NewsPanel
                  posts={newsPosts}
                  loading={newsLoading}
                  error={newsError}
                  readNewsIds={readNewsIds}
                  isAdmin={isAdmin}
                  user={user}
                  onMarkRead={markNewsRead}
                  onMarkAllRead={markAllNewsRead}
                  onPostsChanged={fetchNewsPosts}
                />
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