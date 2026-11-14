import { useState, useCallback, useEffect } from 'react';
import { User, BookOpen, Key, Type, PenLine } from 'lucide-react';
import { AuthProvider } from '@/context/AuthContext';
import { FontSettingsProvider } from '@/context/FontSettingsContext';
import OceanBackground from '@/components/OceanBackground';
import Header from '@/components/Header';
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
import Toast from '@/components/Toast';

type LandingTab = 'characters' | 'rules' | 'custom-apex' | 'ai-config' | 'font';

const TABS: { id: LandingTab; label: string; icon: typeof User }[] = [
  { id: 'characters', label: 'Characters', icon: User },
  { id: 'rules', label: 'Rules', icon: BookOpen },
  { id: 'custom-apex', label: 'Custom Apex', icon: PenLine },
  { id: 'ai-config', label: 'AI Config', icon: Key },
  { id: 'font', label: 'Font', icon: Type },
];

function AppContent() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [creationModalOpen, setCreationModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'home' | 'play'>('home');
  const [activeTab, setActiveTab] = useState<LandingTab>('characters');
  const [activePlaythroughId, setActivePlaythroughId] = useState<string | null>(null);
  const [rosterRefreshKey, setRosterRefreshKey] = useState(0);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleCreateCharacter = useCallback(() => {
    setCreationModalOpen(true);
  }, []);

  const handleNavigate = useCallback((destination: string) => {
    if (destination === 'home') {
      setCurrentView('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Map header nav labels to landing tabs
    if (destination === 'roster' || destination === 'characters') {
      setCurrentView('home');
      setActiveTab('characters');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (destination === 'rules') {
      setCurrentView('home');
      setActiveTab('rules');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (destination === 'ai-config') {
      setCurrentView('home');
      setActiveTab('ai-config');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (destination === 'font') {
      setCurrentView('home');
      setActiveTab('font');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (destination === 'hero') {
      setCurrentView('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (destination === 'create') {
      setCreationModalOpen(true);
      return;
    }
  }, []);

  const dismissToast = useCallback(() => setToastMessage(null), []);

  const handleBugReportSubmitted = useCallback(() => {
    setToastMessage('Bug reported successfully!');
  }, []);

  useEffect(() => {
    document.title =
      currentView === 'play'
        ? 'Playing | Mermaids'
        : "Let's Play Mermaids";
  }, [currentView]);

  return (
    <div className="relative min-h-screen">
      <OceanBackground />
      {currentView !== 'play' && (
        <Header
          onSignIn={() => setAuthModalOpen(true)}
          onNavigate={handleNavigate}
          onReportBug={() => setBugReportOpen(true)}
        />
      )}
      {currentView === 'play' && activePlaythroughId ? (
        <PlayScreen
          playthroughId={activePlaythroughId}
          onBack={() => { setCurrentView('home'); setActivePlaythroughId(null); }}
          onSignIn={() => setAuthModalOpen(true)}
          onReportBug={() => setBugReportOpen(true)}
        />
      ) : (
        <>
          <main className="relative z-10">
            <Hero />

            {/* Tab bar */}
            <div className="sticky top-16 z-30 border-y border-abyss-700/30 bg-abyss-950/90 backdrop-blur-md">
              <div className="mx-auto flex max-w-3xl items-stretch justify-between gap-0.5 px-1 sm:gap-2 sm:px-2">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = tab.id === activeTab;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`group flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 font-medium transition-all sm:flex-row sm:gap-2 sm:px-2 sm:py-3 sm:text-sm ${
                        isActive
                          ? 'text-pearl'
                          : 'text-muted/70 hover:text-pearl'
                      }`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-lg transition-all sm:h-7 sm:w-7 ${
                        isActive
                          ? 'bg-abyss-500/30 text-pearl'
                          : 'text-muted/70 group-hover:bg-abyss-700/40 group-hover:text-pearl'
                      }`}>
                        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </span>
                      <span className="text-[10px] leading-none sm:text-sm">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            <div className="px-4 pt-8 pb-16 sm:px-6 lg:px-8">
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
                  onBack={() => handleNavigate('hero')}
                  onSignIn={() => setAuthModalOpen(true)}
                  embedded
                />
              )}
              {activeTab === 'custom-apex' && (
                <CustomApexPanel onSignIn={() => setAuthModalOpen(true)} />
              )}
              {activeTab === 'ai-config' && (
                <AIConfiguration onSignIn={() => setAuthModalOpen(true)} />
              )}
              {activeTab === 'font' && (
                <FontSettingsPanel />
              )}
            </div>
          </main>
          <Footer />
        </>
      )}
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
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
