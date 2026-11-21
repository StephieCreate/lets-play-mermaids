import {
  User,
  BookOpen,
  PenLine,
  Compass,
  Sparkles,
  Check,
  Settings,
  Bug,
  LogIn,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export type AppTab =
  | 'characters'
  | 'rules'
  | 'custom-apex'
  | 'world-lore'
  | 'news'
  | 'settings';

interface HeaderProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onSignIn: () => void;
  onReportBug: () => void;
  hasUnreadNews?: boolean;
}

const PRIMARY_TABS: { id: Exclude<AppTab, 'settings'>; label: string; icon: typeof User }[] = [
  { id: 'characters', label: 'Characters', icon: User },
  { id: 'rules', label: 'Rules', icon: BookOpen },
  { id: 'custom-apex', label: 'Custom Apex', icon: PenLine },
  { id: 'world-lore', label: 'World Lore', icon: Compass },
  { id: 'news', label: 'News', icon: Sparkles },
];

export default function Header({
  activeTab,
  onSelectTab,
  onSignIn,
  onReportBug,
  hasUnreadNews = false,
}: HeaderProps) {
  const { user, signOut } = useAuth();

  return (
    <>
      {/* DESKTOP LEFT SIDEBAR (translucent frosted glass over jellyfish background) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-abyss-700/30 bg-abyss-950/65 backdrop-blur-xl md:flex">
        <div className="px-4 pt-6 pb-2">
          <span className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-abyss-300/70">
            Directory
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Main navigation">
          {PRIMARY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const showNewsBadge = tab.id === 'news' && hasUnreadNews;

            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`group flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'border border-abyss-400/30 bg-abyss-500/25 text-pearl shadow-sm shadow-abyss-950/40'
                    : 'border border-transparent text-muted hover:bg-abyss-800/40 hover:text-pearl'
                }`}
              >
                <span className="relative flex h-6 w-6 items-center justify-center">
                  <Icon
                    className={`h-4 w-4 transition-colors ${
                      isActive ? 'text-pearl' : 'text-abyss-200/70 group-hover:text-pearl'
                    }`}
                  />
                  {showNewsBadge && (
                    <span
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow-sm shadow-red-950/70 ring-2 ring-abyss-950"
                      aria-label="Unread news updates"
                    >
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                  )}
                </span>
                <span className="flex-1 text-left">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Utility Section */}
        <div className="mt-auto space-y-1 border-t border-abyss-700/30 p-3">
          <button
            onClick={() => onSelectTab('settings')}
            className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'settings'
                ? 'border border-abyss-400/30 bg-abyss-500/25 text-pearl'
                : 'border border-transparent text-muted hover:bg-abyss-800/40 hover:text-pearl'
            }`}
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span>Player Settings</span>
          </button>

          <button
            onClick={onReportBug}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-transparent px-3.5 py-2.5 text-sm font-medium text-muted transition-all hover:bg-abyss-800/40 hover:text-pearl"
          >
            <Bug className="h-4 w-4 shrink-0" />
            <span>Report a Bug</span>
          </button>

          <div className="pt-2">
            {user ? (
              <div className="space-y-2 rounded-xl border border-abyss-700/30 bg-abyss-900/40 p-2.5">
                <p className="truncate px-1 text-xs text-muted" title={user.email ?? undefined}>
                  {user.email}
                </p>
                <button
                  onClick={signOut}
                  className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-abyss-400/25 bg-abyss-700/25 px-3 py-1.5 text-xs font-medium text-pearl transition-all hover:border-coral-500/40 hover:bg-coral-600/15"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={onSignIn}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-abyss-400/35 bg-abyss-600/25 px-4 py-2 text-sm font-medium text-pearl transition-all hover:border-abyss-300/50 hover:bg-abyss-500/35 hover:text-glow-soft"
              >
                <LogIn className="h-4 w-4" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* MOBILE MINIMAL TOP BAR (left side completely clean — no logo/waves) */}
      <header className="fixed left-0 right-0 top-0 z-40 border-b border-abyss-700/20 bg-abyss-950/60 backdrop-blur-md md:hidden">
        <div className="flex h-14 items-center justify-end gap-2 px-3">
          <button
            onClick={() => onSelectTab('settings')}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
              activeTab === 'settings'
                ? 'border-abyss-300/50 bg-abyss-500/35 text-pearl'
                : 'border-abyss-400/25 bg-abyss-800/35 text-muted hover:border-abyss-300/40 hover:text-pearl'
            }`}
            aria-label="Open player settings"
            title="Player Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          {user ? (
            <button
              onClick={signOut}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-abyss-400/25 bg-abyss-800/35 text-muted transition-all hover:border-coral-500/40 hover:bg-coral-600/15 hover:text-pearl"
              aria-label="Sign out"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={onSignIn}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-abyss-400/30 bg-abyss-600/25 px-3 text-xs font-medium text-pearl transition-all hover:border-abyss-300/50 hover:bg-abyss-500/35"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* MOBILE FIXED 5-TAB BOTTOM NAVIGATION BAR */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-abyss-700/30 bg-abyss-950/80 backdrop-blur-xl pb-safe md:hidden"
        aria-label="Mobile bottom navigation"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-1 py-1.5">
          {PRIMARY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const showNewsBadge = tab.id === 'news' && hasUnreadNews;

            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex min-h-13 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition-all ${
                  isActive ? 'text-pearl' : 'text-muted/75 hover:text-pearl'
                }`}
              >
                <span
                  className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                    isActive ? 'bg-abyss-500/30 text-pearl' : 'text-muted/80'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {showNewsBadge && (
                    <span
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow-sm shadow-red-950/70 ring-2 ring-abyss-950"
                      aria-label="Unread news updates"
                    >
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium leading-none tracking-tight">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}