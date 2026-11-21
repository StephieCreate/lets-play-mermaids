export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export interface ConversationTurn {
  role: 'player' | 'narrator';
  content: string;
}

export interface NarrateRequest {
  playthroughId: string;
  characterName: string;
  characterConcept: string;
  characterTraits: Record<string, unknown>;
  apexTarget: string;
  currentScene: string | null;
  storyState: Record<string, unknown>;
  playerInput: string;
  gentleDay?: boolean;
  conversationHistory?: ConversationTurn[];
  aiModel?: string;
}

export interface NarrativeSummaryRow {
  id: string;
  season: string;
  year: number;
  content: string;
}

export interface TimePacingState {
  currentPhase: string;
  turnsInPhase: number;
  totalDayTurns: number;
  directive: string;
}

export const SEASON_LABELS: Record<string, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  winter: "Winter",
};

export const SEASON_KEYWORDS: Record<string, string[]> = {
  spring: ["spring"],
  summer: ["summer"],
  fall: ["fall", "autumn"],
  winter: ["winter"],
};

export const CORE_RULE_SLUGS = [
  "universal-core-engine",
  "universal-game-templates",
  "medicinal-algae-quick-reference",
  "lets-play-mermaids-world-lore",
];

export function apexRuleSlug(apexTarget: string): string {
  return `apex-${apexTarget}`;
}

export function triadSurrogateSlug(triadTarget: string): string {
  return `triad-surrogate-${triadTarget}`;
}
