/*
# Create user_settings table for persistent reading preferences

1. New Tables
- `user_settings`
  - `user_id` (uuid, primary key, references auth.users, cascade delete, defaults to the signed-in user)
  - `font_family` (text, one of: inter, lexend, atkinson, comic)
  - `font_size` (text, one of: small, medium, large, xlarge, jumbo)
  - `line_height` (text, one of: compact, comfortable, relaxed)
  - `updated_at` (timestamptz, defaults to now())

2. Security
- Enable RLS on `user_settings`.
- Grant SELECT, INSERT, UPDATE to `authenticated` only (no anon access).
- Owner-scoped policies: each user can only select, insert, and update their own row. Deletes are not allowed from the app.

3. Notes
- One row per user, enforced by the primary key so upserts on user_id update the existing row.
*/

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  font_family text NOT NULL DEFAULT 'lexend' CHECK (font_family IN ('inter', 'lexend', 'atkinson', 'comic')),
  font_size text NOT NULL DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large', 'xlarge', 'jumbo')),
  line_height text NOT NULL DEFAULT 'comfortable' CHECK (line_height IN ('compact', 'comfortable', 'relaxed')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON user_settings TO authenticated;

DROP POLICY IF EXISTS "select_own_user_settings" ON user_settings;
CREATE POLICY "select_own_user_settings" ON user_settings FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_user_settings" ON user_settings;
CREATE POLICY "insert_own_user_settings" ON user_settings FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_user_settings" ON user_settings;
CREATE POLICY "update_own_user_settings" ON user_settings FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
