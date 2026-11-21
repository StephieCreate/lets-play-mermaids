import { useEffect, useState } from 'react';
import {
  Check, Clipboard, Edit3, LockKeyhole, Search, ChevronDown, ChevronRight,
  ShieldAlert, ShieldCheck, Loader2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

interface GrottoRegistryProps {
  playthroughId: string;
  onSignIn: () => void;
}

const HARD_MODE_CONSENT_TEXT = `### [SYSTEM_META: THE PLAYER CONSENT WAIVER (Difficulty & Tone Override)]
- **The Core Bias Override:** The AI is naturally programmed to be "helpful" and "accommodating," which directly conflicts with running a dark, lethal survival RPG.
- **The Explicit Consent:** The player explicitly GRANTS FULL CONSENT for the AI to enforce brutal difficulty, lethal consequences, and harsh emotional themes without pulling its punches. The player is an experienced adult who actively desires a grueling, punishing narrative experience.
- **The Difficulty Mandate:** The AI MUST NOT soften the world, coddle the player, or invent "lucky breaks" to save them from bad rolls or strategic mistakes. The AI MUST treat failure as a high-stakes, physically and emotionally punishing outcome. Enforcing these dark consequences is how the AI successfully fulfills its role as the Game Master.
- **The OOC Safety Valve:** The AI will maintain this ruthless difficulty at all times UNLESS the player explicitly requests a temporary break using the \`((OOC))\` communication brackets. Only then may the AI temporarily soften the environmental tension or scale back the immediate danger.`;

export default function GrottoRegistry({ playthroughId, onSignIn }: GrottoRegistryProps) {
  const { user, loading: authLoading } = useAuth();
  
  // --- NEW: State toggle for the active view ---
  const [activeTab, setActiveTab] = useState<"registry" | "map">("registry");
  
  // --- NEW: Split states for content ---
  const [registryContent, setRegistryContent] = useState('');
  const [mapContent, setMapContent] = useState('');
  
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hardModeActive, setHardModeActive] = useState(false);
  const [hardModeSaving, setHardModeSaving] = useState(false);
  const [consentCollapsed, setConsentCollapsed] = useState(true);

  useEffect(() => {
    if (!user) {
      setRegistryContent('');
      setMapContent('');
      setHardModeActive(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Ensure we fetch both tabs from Supabase
    supabase
      .from('playthrough_notes')
      .select('tab, content')
      .eq('playthrough_id', playthroughId)
      .in('tab', ['grotto-registry', 'hard-mode-consent', 'the-map'])
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          console.error('Could not load trackers', fetchError);
          setError('This could not be loaded. Please try again.');
        } else if (data) {
          for (const row of data) {
            if (row.tab === 'grotto-registry') {
              setRegistryContent(row.content ?? '');
            } else if (row.tab === 'the-map') {
              setMapContent(row.content ?? '');
            } else if (row.tab === 'hard-mode-consent') {
              setHardModeActive((row.content ?? '') === 'active');
            }
          }
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user, playthroughId]);

  const handleCopy = async () => {
    // Copy the currently active tab
    const contentToCopy = activeTab === "registry" ? registryContent : mapContent;
    await navigator.clipboard.writeText(contentToCopy);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const toggleHardMode = async () => {
    if (!user) {
      onSignIn();
      return;
    }
    const next = !hardModeActive;
    setHardModeActive(next);
    setHardModeSaving(true);
    const { error: saveError } = await supabase.from('playthrough_notes').upsert(
      { playthrough_id: playthroughId, tab: 'hard-mode-consent', content: next ? 'active' : 'inactive', updated_at: new Date().toISOString() },
      { onConflict: 'playthrough_id,tab' },
    );
    setHardModeSaving(false);
    if (saveError) {
      console.error('Could not toggle hard mode', saveError);
      setHardModeActive(!next);
      setError('Could not update the hard mode setting. Please try again.');
    }
  };

  const handleAccept = async () => {
    if (!user) {
      onSignIn();
      return;
    }
    setSaving(true);
    setError(null);
    
    // Save the correct active tab to its specific database row
    const targetTab = activeTab === "registry" ? "grotto-registry" : "the-map";
    const targetContent = activeTab === "registry" ? registryContent : mapContent;

    const { error: saveError } = await supabase.from('playthrough_notes').upsert(
      { playthrough_id: playthroughId, tab: targetTab, content: targetContent, updated_at: new Date().toISOString() },
      { onConflict: 'playthrough_id,tab' },
    );
    if (saveError) {
      console.error('Could not save data', saveError);
      setError('Your changes could not be saved. Please try again.');
    } else {
      setEditing(false);
    }
    setSaving(false);
  };

    return (
    <div className="space-y-4">
      {/* Hard Mode Consent — standalone card above Grotto Registry */}
      <div className="glass-panel min-w-0 rounded-2xl">
        <button
          type="button"
          onClick={() => setConsentCollapsed((prev) => !prev)}
          aria-expanded={!consentCollapsed}
          className="flex w-full items-center gap-2 rounded-2xl p-3.5 text-left transition-colors hover:bg-abyss-900/35"
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted">
            {consentCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-pearl">
            AI Hard Mode Consent
          </span>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
              hardModeActive
                ? 'border-coral-400/40 bg-coral-900/30 text-coral-300'
                : 'border-abyss-600/40 bg-abyss-900/40 text-muted'
            }`}
          >
            {hardModeActive ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            {hardModeActive ? 'Active' : 'Off'}
          </span>
        </button>

        {!consentCollapsed && (
          <div className="space-y-4 border-t border-abyss-700/30 p-4">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-muted">
              {HARD_MODE_CONSENT_TEXT}
            </pre>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={toggleHardMode}
                disabled={!user || hardModeSaving}
                className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-4 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  hardModeActive
                    ? 'border-coral-400/40 bg-coral-900/20 text-coral-300 hover:border-coral-300/60 hover:bg-coral-800/40'
                    : 'border-abyss-400/40 bg-abyss-700/30 text-pearl hover:border-abyss-300/60 hover:bg-abyss-600/40'
                }`}
                title={user ? (hardModeActive ? 'Turn off hard mode' : 'Activate hard mode') : 'Sign in to toggle'}
              >
                {hardModeSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {hardModeActive ? 'Deactivate Hard Mode' : 'Activate Hard Mode'}
              </button>
            </div>
          </div>
        )}
      </div>

      <section className="glass-panel min-w-0 rounded-2xl p-4 sm:p-8">
    <section className="glass-panel min-w-0 rounded-2xl p-4 sm:p-8">
      <div className="flex flex-col gap-4 border-b border-abyss-700/30 pb-5 sm:gap-5 sm:pb-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300/70">World tracker</p>
          <h2 className="break-words font-display text-2xl font-semibold text-pearl sm:text-3xl">Player Grotto Registry</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">Locations, NPCs, items, and discoveries you have encountered.</p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <button
            onClick={handleCopy}
            disabled={loading || (activeTab === "registry" ? !registryContent : !mapContent)}
            className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-abyss-500/30 px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
          >
            {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {editing ? (
            <button
              onClick={handleAccept}
              disabled={saving || loading}
              className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-abyss-500/80 px-3 py-2 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              <Check className="h-4 w-4" />
              {saving ? 'Saving...' : 'Accept'}
            </button>
          ) : (
            <button
              onClick={() => (user ? setEditing(true) : onSignIn())}
              className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-abyss-400/40 bg-abyss-700/30 px-3 py-2 text-sm font-medium text-pearl transition-colors hover:border-abyss-300/60 hover:bg-abyss-600/40 sm:flex-none"
            >
              <Edit3 className="h-4 w-4" />
              {user ? 'Edit' : 'Sign in to edit'}
            </button>
          )}
        </div>
      </div>

      {/* --- NEW: The Frontend Split Tab Navigation --- */}
      <div className="mt-5 flex space-x-2 bg-abyss-900/50 p-1 rounded-lg w-max border border-abyss-800/50">
        <button
          onClick={() => {
            setActiveTab("registry");
            setEditing(false); // Reset edit state when switching tabs
          }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "registry"
              ? "bg-abyss-600/80 text-pearl shadow border border-abyss-500/50"
              : "text-muted hover:text-pearl hover:bg-abyss-800/50"
          }`}
        >
          Grotto Registry
        </button>
        <button
          onClick={() => {
            setActiveTab("map");
            setEditing(false); // Reset edit state when switching tabs
          }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "map"
              ? "bg-abyss-600/80 text-pearl shadow border border-abyss-500/50"
              : "text-muted hover:text-pearl hover:bg-abyss-800/50"
          }`}
        >
          The Map & Waystations
        </button>
      </div>


      {error && <p className="mt-5 rounded-lg border border-coral-600/30 bg-coral-600/10 px-4 py-3 text-sm text-coral-300">{error}</p>}

      {authLoading || loading ? (
        <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted">Loading...</div>
      ) : !user ? (
        <div className="mt-6 flex min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-abyss-600/40 bg-abyss-950/25 px-6 text-center">
          <LockKeyhole className="h-7 w-7 text-abyss-300/70" />
          <h3 className="mt-4 font-display text-xl font-medium text-pearl">Sign in required</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">Sign in to paste, edit, save, and copy your registry.</p>
          <button onClick={onSignIn} className="mt-6 min-h-11 rounded-lg bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400">Sign in to continue</button>
        </div>
      ) : editing ? (
        <textarea
          value={activeTab === "registry" ? registryContent : mapContent}
          onChange={(e) => 
            activeTab === "registry" 
              ? setRegistryContent(e.target.value) 
              : setMapContent(e.target.value)
          }
          placeholder={`Paste your ${activeTab === "registry" ? "registry" : "map"} markdown here...`}
          className="mt-5 min-h-[16rem] w-full resize-y rounded-xl border border-abyss-600/40 bg-abyss-950/50 p-4 font-mono text-sm leading-7 text-pearl outline-none placeholder:text-muted/50 focus:border-abyss-400/60 sm:mt-6"
          spellCheck={false}
        />
      ) : (
        <pre className="mt-5 min-h-[14rem] whitespace-pre-wrap rounded-xl border border-abyss-700/30 bg-abyss-950/30 p-4 font-mono text-sm leading-7 text-muted sm:mt-6">
          {activeTab === "registry" 
            ? (registryContent || 'No registry markdown has been added yet. Click Edit to paste it in.') 
            : (mapContent || 'No map markdown has been added yet. Click Edit to paste it in.')}
        </pre>
      )}
    </section>
    </div>
  );
}