/*
# Create user_ai_keys table (multi-provider, BYOK)

## Purpose
Replaces the old single-provider user_api_keys table. Each player can store
multiple API keys for any AI provider they want — DeepSeek, OpenAI, Gemini,
or a custom OpenAI-compatible endpoint. They pick which key is active per
session, and can add/remove keys freely.

## Schema
- id (uuid pk)
- user_id (uuid, fk auth.users, indexed) — owner
- label (text) — user-given name e.g. "My DeepSeek Free Key"
- provider (text) — 'deepseek' | 'openai' | 'gemini' | 'custom'
- api_key_encrypted (bytea) — pgp-encrypted plaintext key
- last_four (text) — last 4 chars for masked display
- base_url (text, nullable) — custom endpoint for 'custom' provider
- is_active (boolean, default false) — only one key per user is active
- created_at, updated_at (timestamptz)

## RLS
- Owner-scoped CRUD policies (auth.uid() = user_id).

## SECURITY DEFINER functions
- upsert_ai_key(p_label, p_provider, p_key, p_base_url) — encrypts and
  inserts/updates a key; sets it as active if it's the user's first key.
- delete_ai_key(p_key_id) — removes a key (and clears is_active if it was active).
- set_active_ai_key(p_key_id) — deactivates all others, activates this one.
- get_active_ai_key(p_user, p_secret) — returns decrypted key + provider +
  base_url for the user's currently active key. Called by the edge function.

## View
- user_ai_keys_safe — non-sensitive projection for the browser.

## Note
The old user_api_keys table and its functions/views are dropped cleanly.
*/

-- Drop old BYOK artifacts.
DROP VIEW IF EXISTS user_api_keys_safe;
DROP FUNCTION IF EXISTS get_user_api_key(uuid);
DROP FUNCTION IF EXISTS get_user_api_key(uuid, text);
DROP FUNCTION IF EXISTS upsert_user_api_key(text, text);
DROP FUNCTION IF EXISTS clear_user_api_key(text);
DROP FUNCTION IF EXISTS set_active_api_key(text);
DROP TABLE IF EXISTS user_api_keys;

CREATE TABLE user_ai_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'My Key',
  provider text NOT NULL CHECK (provider IN ('deepseek','openai','gemini','custom')),
  api_key_encrypted bytea NOT NULL,
  last_four text,
  base_url text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_ai_keys_user ON user_ai_keys(user_id);

ALTER TABLE user_ai_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ai_keys" ON user_ai_keys;
CREATE POLICY "select_own_ai_keys"
  ON user_ai_keys FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ai_keys" ON user_ai_keys;
CREATE POLICY "insert_own_ai_keys"
  ON user_ai_keys FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_ai_keys" ON user_ai_keys;
CREATE POLICY "update_own_ai_keys"
  ON user_ai_keys FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_ai_keys" ON user_ai_keys;
CREATE POLICY "delete_own_ai_keys"
  ON user_ai_keys FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- SECURITY DEFINER: insert or update an encrypted key.
DROP FUNCTION IF EXISTS upsert_ai_key(text, text, text, text);
CREATE OR REPLACE FUNCTION upsert_ai_key(
  p_label text,
  p_provider text,
  p_key text,
  p_base_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_secret text;
  v_enc bytea;
  v_last_four text;
  v_clean text;
  v_id uuid;
  v_count int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_provider NOT IN ('deepseek','openai','gemini','custom') THEN
    RAISE EXCEPTION 'Invalid provider';
  END IF;
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RAISE EXCEPTION 'Key must not be empty';
  END IF;

  SELECT value INTO v_secret FROM app_secrets WHERE name = 'user_key_encryption_secret';
  IF v_secret IS NULL OR v_secret = '' OR v_secret LIKE 'CHANGE_ME-%' THEN
    RAISE EXCEPTION 'Encryption secret not configured. Ask the site owner to set it.';
  END IF;

  v_clean := trim(p_key);
  v_enc := pgp_sym_encrypt(v_clean, v_secret);
  v_last_four := right(v_clean, 4);

  SELECT count(*) INTO v_count FROM user_ai_keys WHERE user_id = v_user;

  INSERT INTO user_ai_keys (user_id, label, provider, api_key_encrypted,
                            last_four, base_url, is_active)
  VALUES (v_user, COALESCE(p_label, 'My Key'), p_provider, v_enc,
          v_last_four, NULLIF(trim(p_base_url), ''), v_count = 0)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION upsert_ai_key(text,text,text,text) TO authenticated;

-- SECURITY DEFINER: delete a key.
DROP FUNCTION IF EXISTS delete_ai_key(uuid);
CREATE OR REPLACE FUNCTION delete_ai_key(p_key_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_was_active boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT is_active INTO v_was_active
    FROM user_ai_keys WHERE id = p_key_id AND user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Key not found';
  END IF;

  DELETE FROM user_ai_keys WHERE id = p_key_id AND user_id = v_user;

  -- If we deleted the active key, activate the most recent remaining one.
  IF v_was_active THEN
    UPDATE user_ai_keys SET is_active = true, updated_at = now()
      WHERE id = (
        SELECT id FROM user_ai_keys
          WHERE user_id = v_user
          ORDER BY created_at DESC LIMIT 1
      ) AND user_id = v_user;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_ai_key(uuid) TO authenticated;

-- SECURITY DEFINER: set a key as active (deactivate all others first).
DROP FUNCTION IF EXISTS set_active_ai_key(uuid);
CREATE OR REPLACE FUNCTION set_active_ai_key(p_key_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE user_ai_keys SET is_active = false, updated_at = now()
    WHERE user_id = v_user AND is_active = true;

  UPDATE user_ai_keys SET is_active = true, updated_at = now()
    WHERE id = p_key_id AND user_id = v_user;
END;
$$;
GRANT EXECUTE ON FUNCTION set_active_ai_key(uuid) TO authenticated;

-- SECURITY DEFINER: return decrypted active key for a user.
-- Called by the edge function (service role) with the master secret.
DROP FUNCTION IF EXISTS get_active_ai_key(uuid, text);
CREATE OR REPLACE FUNCTION get_active_ai_key(p_user uuid, p_secret text)
RETURNS TABLE(
  provider text,
  api_key text,
  base_url text,
  label text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  IF p_secret IS NULL OR p_secret = '' THEN
    RAISE EXCEPTION 'Encryption secret not provided';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN
    RAISE EXCEPTION 'Not allowed to read another user''s key';
  END IF;

  SELECT provider, api_key_encrypted, base_url, label
    INTO v_row
    FROM user_ai_keys
    WHERE user_id = p_user AND is_active = true
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_row.provider::text,
    pgp_sym_decrypt(v_row.api_key_encrypted, p_secret)::text,
    v_row.base_url,
    v_row.label;
END;
$$;
GRANT EXECUTE ON FUNCTION get_active_ai_key(uuid, text) TO authenticated;

-- Safe view for the browser: no plaintext, no encrypted blob.
DROP VIEW IF EXISTS user_ai_keys_safe;
CREATE VIEW user_ai_keys_safe AS
SELECT
  id, user_id, label, provider, last_four, base_url, is_active,
  created_at, updated_at
FROM user_ai_keys;

ALTER VIEW user_ai_keys_safe OWNER TO postgres;
GRANT SELECT ON user_ai_keys_safe TO authenticated;
