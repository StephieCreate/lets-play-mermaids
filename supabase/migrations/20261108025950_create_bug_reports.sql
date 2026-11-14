/*
# Create bug_reports table

1. New Tables
- `bug_reports`
  - `id` (uuid, primary key)
  - `user_id` (uuid, nullable, defaults to the signed-in user; empty for signed-out players)
  - `playthrough_id` (uuid, nullable, links to the playthrough open when the report was filed)
  - `active_apex` (text, nullable, readable Apex name the player was romancing)
  - `description` (text, required, 1 to 5000 characters)
  - `browser_info` (text, required, up to 1000 characters, stores the browser user agent)
  - `created_at` (timestamptz, defaults to now)

2. Security
- Enable RLS on `bug_reports`.
- Grant INSERT only to `anon` and `authenticated`. Players cannot read reports back through the app.
- Insert policy: a report must either be anonymous (no user_id) or belong to the signed-in user; a playthrough can only be attached if the signed-in user owns it.

3. Notes
- Reports are read by the developer directly in the database.
- Foreign keys use ON DELETE SET NULL so deleting a playthrough or account keeps the report.
*/

CREATE TABLE IF NOT EXISTS bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  playthrough_id uuid REFERENCES playthroughs(id) ON DELETE SET NULL,
  active_apex text,
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 5000),
  browser_info text NOT NULL CHECK (char_length(browser_info) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bug_reports_user_id_idx ON bug_reports (user_id);
CREATE INDEX IF NOT EXISTS bug_reports_playthrough_id_idx ON bug_reports (playthrough_id);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON bug_reports TO anon, authenticated;

DROP POLICY IF EXISTS "insert_bug_reports" ON bug_reports;
CREATE POLICY "insert_bug_reports" ON bug_reports FOR INSERT
TO anon, authenticated
WITH CHECK (
  (user_id IS NULL OR user_id = auth.uid())
  AND (
    playthrough_id IS NULL
    OR EXISTS (
      SELECT 1 FROM playthroughs p
      WHERE p.id = bug_reports.playthrough_id
        AND p.user_id = auth.uid()
    )
  )
);
