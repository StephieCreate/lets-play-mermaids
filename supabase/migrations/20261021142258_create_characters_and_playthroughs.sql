/*
# Create characters and playthroughs tables

## Purpose
Sets up the data model for a text-based RPG where each player can create
multiple mermaid characters, and each character can have multiple independent
playthroughs (e.g. romancing different apex characters, replaying with
different choices).

## New Tables

### characters
- `id` (uuid, primary key)
- `user_id` (uuid, not null, defaults to auth.uid() — the owning player)
- `name` (text, not null — the mermaid's name)
- `concept` (text, nullable — short description / archetype the player writes)
- `traits` (jsonb, defaults to '{}' — flexible stat/trait storage for the rules system)
- `portrait_color` (text, nullable — a color hint for the character card visual)
- `created_at` (timestamptz, defaults to now())
- `updated_at` (timestamptz, defaults to now())

### playthroughs
- `id` (uuid, primary key)
- `character_id` (uuid, not null, foreign key to characters ON DELETE CASCADE)
- `user_id` (uuid, not null, defaults to auth.uid() — denormalized owner for simpler RLS)
- `title` (text, nullable — player-given label like "Romance: The Abyssal Lord")
- `apex_target` (text, nullable — which apex this playthrough is romancing)
- `status` (text, defaults to 'active' — 'active' | 'completed' | 'abandoned')
- `story_state` (jsonb, defaults to '{}' — the full current game state: location, inventory, flags, etc.)
- `current_scene` (text, nullable — a label/ID for where the story currently is)
- `turn_count` (integer, defaults to 0)
- `created_at` (timestamptz, defaults to now())
- `updated_at` (timestamptz, defaults to now())

## Security
- Both tables have RLS enabled.
- Both tables are owner-scoped to the authenticated user via `user_id DEFAULT auth.uid()`.
- Four separate CRUD policies each (SELECT/INSERT/UPDATE/DELETE), scoped to `TO authenticated`.
- Playthroughs also check ownership through the parent character via user_id (denormalized).

## Important Notes
1. The `DEFAULT auth.uid()` on user_id means frontend inserts that omit user_id will still pass RLS.
2. Playthroughs cascade-delete with their parent character.
3. story_state is jsonb so the rules system can store arbitrary structured state without migrations.
*/

CREATE TABLE IF NOT EXISTS characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  concept text,
  traits jsonb NOT NULL DEFAULT '{}'::jsonb,
  portrait_color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_characters" ON characters;
CREATE POLICY "select_own_characters" ON characters FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_characters" ON characters;
CREATE POLICY "insert_own_characters" ON characters FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_characters" ON characters;
CREATE POLICY "update_own_characters" ON characters FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_characters" ON characters;
CREATE POLICY "delete_own_characters" ON characters FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS playthroughs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  apex_target text,
  status text NOT NULL DEFAULT 'active',
  story_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_scene text,
  turn_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE playthroughs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_playthroughs" ON playthroughs;
CREATE POLICY "select_own_playthroughs" ON playthroughs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_playthroughs" ON playthroughs;
CREATE POLICY "insert_own_playthroughs" ON playthroughs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_playthroughs" ON playthroughs;
CREATE POLICY "update_own_playthroughs" ON playthroughs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_playthroughs" ON playthroughs;
CREATE POLICY "delete_own_playthroughs" ON playthroughs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_playthroughs_character_id ON playthroughs(character_id);
CREATE INDEX IF NOT EXISTS idx_playthroughs_user_id ON playthroughs(user_id);