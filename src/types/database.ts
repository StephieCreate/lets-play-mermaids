export interface RuleDocument {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Character {
  id: string;
  user_id: string;
  name: string;
  concept: string | null;
  traits: Record<string, unknown>;
  portrait_color: string | null;
  emoji: string | null;
  created_at: string;
  updated_at: string;
}

export interface Playthrough {
  id: string;
  character_id: string;
  user_id: string;
  title: string | null;
  apex_target: string | null;
  status: 'active' | 'completed' | 'abandoned';
  story_state: Record<string, unknown>;
  current_scene: string | null;
  turn_count: number;
  created_at: string;
  updated_at: string;
}

export type CharacterWithPlaythroughs = Character & {
  playthroughs: Playthrough[];
};

export interface UserCustomApex {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
}

export interface PlaythroughNote {
  id: string;
  playthrough_id: string;
  user_id: string;
  tab: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface NewsPost {
  id: string;
  slug: string | null;
  phase: string;
  title: string;
  content: string;
  created_at: string;
  created_by: string | null;
  author_name?: string | null;
}
