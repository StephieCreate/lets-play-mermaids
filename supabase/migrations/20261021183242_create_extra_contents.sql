/*
# Create extra_contents table

## Purpose
Stores player-authored "Extras" content for a playthrough — custom material
that doesn't belong in the rules, save log, narrative summaries, grotto
registry, or plot wishlist. Each entry has a title, a content text field,
a category label (for the player's own organization), and an active toggle
that controls whether the entry is included in the narrator's turn prompt.

## New Tables
### extra_contents
- `id` (uuid, primary key)
- `playthrough_id` (uuid, not null, foreign key to playthroughs ON DELETE CASCADE)
- `user_id` (uuid, not null, defaults to auth.uid() — the owning player)
- `title` (text, not null — player-given title for the entry)
- `content` (text, not null default '' — the body text of the extra)
- `category` (text, not null default 'general' — organizational label)
- `is_active` (boolean, not null default true — when false, the entry is
  excluded from the narrator's prompt)
- `sort_order` (integer, not null default 0 — for future ordering)
- `created_at` (timestamptz, defaults to now())
- `updated_at` (timestamptz, defaults to now())

## Security
- RLS enabled on extra_contents.
- Four separate CRUD policies (SELECT/INSERT/UPDATE/DELETE), scoped TO
  authenticated, each checking auth.uid() = user_id (owner-scoped).
- user_id defaults to auth.uid() so frontend inserts that omit user_id
  pass RLS.

## Important Notes
1. Rows cascade-delete with their parent playthrough.
2. The narrator edge function reads only entries where is_active = true.
3. Categories are free-text labels chosen by the player from a dropdown for
   organization; they have no effect on the prompt beyond being shown.
*/

CREATE TABLE IF NOT EXISTS extra_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playthrough_id uuid NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE extra_contents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_extra_contents" ON extra_contents;
CREATE POLICY "select_own_extra_contents" ON extra_contents FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_extra_contents" ON extra_contents;
CREATE POLICY "insert_own_extra_contents" ON extra_contents FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_extra_contents" ON extra_contents;
CREATE POLICY "update_own_extra_contents" ON extra_contents FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_extra_contents" ON extra_contents;
CREATE POLICY "delete_own_extra_contents" ON extra_contents FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_extra_contents_playthrough_id ON extra_contents(playthrough_id);
CREATE INDEX IF NOT EXISTS idx_extra_contents_user_id ON extra_contents(user_id);
