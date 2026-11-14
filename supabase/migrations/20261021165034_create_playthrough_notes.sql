/*
# Create playthrough_notes for the play-screen paste tabs

1. New Tables
- `playthrough_notes` stores per-playthrough markdown text for the five
  non-chat play-screen tabs: daily save log, narrative summaries, player
  grotto registry, narrative plot wish list, and extras.
- `id` is the unique note identifier.
- `playthrough_id` links the note to its playthrough (cascades on delete).
- `user_id` is the authenticated owner (defaults to auth.uid()).
- `tab` identifies which of the five play-screen tabs this note belongs to.
- `content` stores the player's pasted markdown text.

2. Security
- Row level security is enabled on `playthrough_notes`.
- Each CRUD action is restricted to authenticated users and their own rows.
- A unique constraint prevents duplicate notes per playthrough + tab.

3. Important Notes
1. The frontend omits `user_id` on insert so ownership always comes from auth.uid().
2. The note content is plain markdown text, not rendered as HTML.
3. Five tab values: daily-save-log, narrative-summaries, grotto-registry, plot-wishlist, extras.
*/

CREATE TABLE IF NOT EXISTS playthrough_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playthrough_id uuid NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tab text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playthrough_notes_playthrough_tab_key UNIQUE (playthrough_id, tab)
);

ALTER TABLE playthrough_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_playthrough_notes" ON playthrough_notes;
CREATE POLICY "select_own_playthrough_notes" ON playthrough_notes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_playthrough_notes" ON playthrough_notes;
CREATE POLICY "insert_own_playthrough_notes" ON playthrough_notes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_playthrough_notes" ON playthrough_notes;
CREATE POLICY "update_own_playthrough_notes" ON playthrough_notes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_playthrough_notes" ON playthrough_notes;
CREATE POLICY "delete_own_playthrough_notes" ON playthrough_notes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_playthrough_notes_playthrough_id ON playthrough_notes(playthrough_id);
CREATE INDEX IF NOT EXISTS idx_playthrough_notes_user_id ON playthrough_notes(user_id);
