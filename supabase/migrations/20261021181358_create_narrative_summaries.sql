/*
# Create narrative_summaries table

## Purpose
Stores per-playthrough seasonal narrative summaries that a player writes
under the "Narrative Summaries" tab. Each row represents one season of one
year (e.g. "Spring, Year 2") and holds the pasted daily-summaries text the
player maintains. The narrator edge function always pulls the current season
and conditionally pulls older seasons when the current scene references them.

## New Tables
### narrative_summaries
- `id` (uuid, primary key)
- `playthrough_id` (uuid, not null, foreign key to playthroughs ON DELETE CASCADE)
- `user_id` (uuid, not null, defaults to auth.uid() — the owning player)
- `season` (text, not null — one of 'spring', 'summer', 'fall', 'winter')
- `year` (integer, not null — 1 or greater; the game is designed for years 1–5)
- `content` (text, not null default '' — the pasted daily summaries text)
- `created_at` (timestamptz, defaults to now())
- `updated_at` (timestamptz, defaults to now())

## Security
- RLS enabled on narrative_summaries.
- Four separate CRUD policies (SELECT/INSERT/UPDATE/DELETE), scoped TO authenticated,
  each checking auth.uid() = user_id (owner-scoped).
- user_id defaults to auth.uid() so frontend inserts that omit user_id pass RLS.

## Important Notes
1. Rows cascade-delete with their parent playthrough.
2. A unique constraint on (playthrough_id, season, year) prevents duplicate seasons.
3. The narrator reads the current season (determined from story_state) every turn
   and pulls older seasons only when the current scene references them.
4. The frontend instructs the player to paste newer days at the top of the text
   field because of how the AI prioritizes information.
*/

CREATE TABLE IF NOT EXISTS narrative_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playthrough_id uuid NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  season text NOT NULL,
  year integer NOT NULL CHECK (year >= 1),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT narrative_summaries_playthrough_season_year_key UNIQUE (playthrough_id, season, year)
);

ALTER TABLE narrative_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_narrative_summaries" ON narrative_summaries;
CREATE POLICY "select_own_narrative_summaries" ON narrative_summaries FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_narrative_summaries" ON narrative_summaries;
CREATE POLICY "insert_own_narrative_summaries" ON narrative_summaries FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_narrative_summaries" ON narrative_summaries;
CREATE POLICY "update_own_narrative_summaries" ON narrative_summaries FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_narrative_summaries" ON narrative_summaries;
CREATE POLICY "delete_own_narrative_summaries" ON narrative_summaries FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_narrative_summaries_playthrough_id ON narrative_summaries(playthrough_id);
CREATE INDEX IF NOT EXISTS idx_narrative_summaries_user_id ON narrative_summaries(user_id);
