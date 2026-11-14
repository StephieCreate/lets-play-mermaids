import { useState } from 'react';
import { Waves, User, BookOpen, Key, Type, Plus, LogIn, LogOut, Menu, X, Bug } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface HeaderProps {
  onSignIn: () => void;
  onNavigate: (section: string) => void;
  onReportBug: () => void;
}

export default function Header({ onSignIn, onNavigate, onReportBug }: HeaderProps) {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = (destination: string) => {
    setMenuOpen(false);
    onNavigate(destination);
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-abyss-700/30 bg-abyss-950/90 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between px-3 py-3 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('hero')}
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <Waves className="h-6 w-6 text-abyss-200 animate-drift" />
          <span className="font-display text-lg font-semibold tracking-wide text-pearl sm:text-xl">
            Mermaids
          </span>
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          <button
            onClick={() => navigate('roster')}
            className="flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-abyss-800/40 hover:text-pearl"
          >
            <User className="h-4 w-4" />
            Characters
          </button>
          <button
            onClick={() => navigate('rules')}
            className="flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-abyss-800/40 hover:text-pearl"
          >
            <BookOpen className="h-4 w-4" />
            Rules
          </button>
          <button
            onClick={() => navigate('ai-config')}
            className="flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-abyss-800/40 hover:text-pearl"
          >
            <Key className="h-4 w-4" />
            AI Config
          </button>
          <button
            onClick={() => navigate('font')}
            className="flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-abyss-800/40 hover:text-pearl"
          >
            <Type className="h-4 w-4" />
            Font
          </button>
          <button
            onClick={onReportBug}
            className="flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-abyss-800/40 hover:text-pearl"
          >
            <Bug className="h-4 w-4" />
            Report a Bug
          </button>
          <button
            onClick={() => navigate('create')}
            className="ml-2 flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-abyss-500 to-abyss-400 px-4 py-2 text-sm font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300"
          >
            <Plus className="h-4 w-4" />
            Create
          </button>
        </nav>

        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="ml-auto mr-2 flex h-11 w-11 items-center justify-center rounded-xl border border-abyss-600/40 text-muted transition-colors hover:bg-abyss-800/50 hover:text-pearl md:hidden"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">
              {user.email}
            </span>
            <button
              onClick={signOut}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-abyss-400/30 bg-abyss-600/20 px-3 py-2 text-sm font-medium text-pearl transition-all hover:border-coral-500/40 hover:bg-coral-600/10 sm:px-4"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        ) : (
          <button
            onClick={onSignIn}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-abyss-400/30 bg-abyss-600/20 px-3 py-2 text-sm font-medium text-pearl transition-all hover:border-abyss-300/50 hover:bg-abyss-500/30 hover:text-glow-soft sm:px-4"
          >
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}
      </div>
      {menuOpen && (
        <nav className="border-t border-abyss-700/30 bg-abyss-950/95 px-3 py-3 shadow-xl shadow-abyss-950/30 md:hidden">
          <button
            onClick={() => navigate('roster')}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-medium text-muted transition-colors hover:bg-abyss-800/50 hover:text-pearl"
          >
            <User className="h-4 w-4" />
            Characters
          </button>
          <button
            onClick={() => navigate('rules')}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-medium text-muted transition-colors hover:bg-abyss-800/50 hover:text-pearl"
          >
            <BookOpen className="h-4 w-4" />
            Rules
          </button>
          <button
            onClick={() => navigate('ai-config')}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-medium text-muted transition-colors hover:bg-abyss-800/50 hover:text-pearl"
          >
            <Key className="h-4 w-4" />
            AI Config
          </button>
          <button
            onClick={() => navigate('font')}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-medium text-muted transition-colors hover:bg-abyss-800/50 hover:text-pearl"
          >
            <Type className="h-4 w-4" />
            Font
          </button>
          <button
            onClick={() => { setMenuOpen(false); onReportBug(); }}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-medium text-muted transition-colors hover:bg-abyss-800/50 hover:text-pearl"
          >
            <Bug className="h-4 w-4" />
            Report a Bug
          </button>
          <button
            onClick={() => navigate('create')}
            className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-4 text-left text-sm font-semibold text-pearl transition-all"
          >
            <Plus className="h-4 w-4" />
            Create Character
          </button>
        </nav>
      )}
    </header>
  );
}
