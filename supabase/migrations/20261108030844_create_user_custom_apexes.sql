/*
# Create user_custom_apexes table

1. New Tables
- `user_custom_apexes`
  - `id` (uuid, primary key)
  - `user_id` (uuid, required, defaults to the signed-in user, deleted with the account)
  - `title` (text, required, 1 to 120 characters)
  - `content` (text, required, markdown rules for the custom Apex, up to 50000 characters)
  - `created_at` (timestamptz, defaults to now)

2. Security
- Enable RLS on `user_custom_apexes`.
- Grant SELECT, INSERT, UPDATE, DELETE to `authenticated` only.
- Owner-only policies on each verb: players can only see and edit their own custom Apexes.
- Grant SELECT to `service_role` so the story engine can read the custom Apex attached to a playthrough.

3. Notes
- This table is never part of the global rule documents and is not included in game cartridge exports.
*/

CREATE TABLE IF NOT EXISTS user_custom_apexes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 50000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_custom_apexes_user_id_idx ON user_custom_apexes (user_id);

ALTER TABLE user_custom_apexes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON user_custom_apexes TO authenticated;
GRANT SELECT ON user_custom_apexes TO service_role;

DROP POLICY IF EXISTS "select_own_custom_apexes" ON user_custom_apexes;
CREATE POLICY "select_own_custom_apexes" ON user_custom_apexes FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_custom_apexes" ON user_custom_apexes;
CREATE POLICY "insert_own_custom_apexes" ON user_custom_apexes FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_custom_apexes" ON user_custom_apexes;
CREATE POLICY "update_own_custom_apexes" ON user_custom_apexes FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_custom_apexes" ON user_custom_apexes;
CREATE POLICY "delete_own_custom_apexes" ON user_custom_apexes FOR DELETE
TO authenticated USING (auth.uid() = user_id);
