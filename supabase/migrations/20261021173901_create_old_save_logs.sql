/*
# Create old_save_logs table

## Purpose
Stores individual archived save log entries that a player pastes under the
"Old Save Logs" sub-section of the Daily Save Log tab. Each entry has a label
(season / day / year the player types in) and the pasted save-log text. Entries
are collapsible and copyable in the UI.

## New Tables
### old_save_logs
- `id` (uuid, primary key)
- `playthrough_id` (uuid, not null, foreign key to playthroughs ON DELETE CASCADE)
- `user_id` (uuid, not null, defaults to auth.uid() — the owning player)
- `label` (text, not null — player-supplied "Season / Day / Year" heading)
- `content` (text, not null default '' — the pasted save log text)
- `created_at` (timestamptz, defaults to now())
- `updated_at` (timestamptz, defaults to now())

## Security
- RLS enabled on old_save_logs.
- Four separate CRUD policies (SELECT/INSERT/UPDATE/DELETE), scoped TO authenticated,
  each checking auth.uid() = user_id (owner-scoped).
- user_id defaults to auth.uid() so frontend inserts that omit user_id still pass RLS.

## Important Notes
1. Rows cascade-delete with their parent playthrough.
2. A per-playthrough index supports listing all old logs for a playthrough efficiently.
3. The label is free text — the player types whatever heading they want (e.g. "Autumn, Day 12, Year 3").
*/

CREATE TABLE IF NOT EXISTS old_save_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playthrough_id uuid NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE old_save_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_old_save_logs" ON old_save_logs;
CREATE POLICY "select_own_old_save_logs" ON old_save_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_old_save_logs" ON old_save_logs;
CREATE POLICY "insert_own_old_save_logs" ON old_save_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_old_save_logs" ON old_save_logs;
CREATE POLICY "update_own_old_save_logs" ON old_save_logs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_old_save_logs" ON old_save_logs;
CREATE POLICY "delete_own_old_save_logs" ON old_save_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_old_save_logs_playthrough_id ON old_save_logs(playthrough_id);
CREATE INDEX IF NOT EXISTS idx_old_save_logs_user_id ON old_save_logs(user_id);
