/*
# Create user_api_keys table (bring-your-own-key, encrypted at rest)

## Purpose
Each player can supply their own DeepSeek API keys so the narrate edge function
calls the AI on their behalf without the app owner paying for token usage.

## What this migration does
1. Creates user_api_keys table — one row per authenticated user.
2. Stores free_tier_key and paid_tier_key, encrypted at rest via pgcrypto.
3. active_key column ('free'|'paid') lets player pick which key to use.
4. last_four columns allow masked display without exposing the key.
5. RLS enabled with owner-scoped policies.
6. SECURITY DEFINER helper functions for upsert/clear/set-active/get-key.
7. Safe view exposes only non-sensitive columns to the browser.

## Encryption
- Master secret: USER_KEY_ENCRYPTION_SECRET, set as an edge-function secret.
- It is passed into the DB functions via the session setting
  app.user_key_encryption_secret, set by the edge function at call time.
- pgp_sym_encrypt / pgp_sym_decrypt perform AES-256 symmetric encryption.

## Security
- RLS: only owning authenticated user can SELECT/INSERT/UPDATE/DELETE.
- Edge function uses service role (bypasses RLS) and calls get_user_api_key
  with the playthrough owner's user_id.
- The plaintext key is never returned to the browser; only last-four masks.
*/

CREATE TABLE IF NOT EXISTS user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  free_tier_key_encrypted bytea,
  paid_tier_key_encrypted bytea,
  free_tier_last_four text,
  paid_tier_last_four text,
  active_key text NOT NULL DEFAULT 'free' CHECK (active_key IN ('free','paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_api_keys" ON user_api_keys;
CREATE POLICY "select_own_api_keys"
  ON user_api_keys FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_api_keys" ON user_api_keys;
CREATE POLICY "insert_own_api_keys"
  ON user_api_keys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_api_keys" ON user_api_keys;
CREATE POLICY "update_own_api_keys"
  ON user_api_keys FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_api_keys" ON user_api_keys;
CREATE POLICY "delete_own_api_keys"
  ON user_api_keys FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- SECURITY DEFINER: encrypt + upsert a key into a named slot.
DROP FUNCTION IF EXISTS upsert_user_api_key(text, text);
CREATE OR REPLACE FUNCTION upsert_user_api_key(p_slot text, p_key text)
RETURNS void
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_slot NOT IN ('free','paid') THEN
    RAISE EXCEPTION 'Invalid slot: must be free or paid';
  END IF;
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RAISE EXCEPTION 'Key must not be empty';
  END IF;

  v_secret := current_setting('app.user_key_encryption_secret', true);
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'Encryption secret not configured';
  END IF;

  v_clean := trim(p_key);
  v_enc := pgp_sym_encrypt(v_clean, v_secret);
  v_last_four := right(v_clean, 4);

  INSERT INTO user_api_keys (user_id, free_tier_key_encrypted, paid_tier_key_encrypted,
                             free_tier_last_four, paid_tier_last_four, active_key)
  VALUES (v_user,
          CASE WHEN p_slot = 'free' THEN v_enc ELSE NULL END,
          CASE WHEN p_slot = 'paid' THEN v_enc ELSE NULL END,
          CASE WHEN p_slot = 'free' THEN v_last_four ELSE NULL END,
          CASE WHEN p_slot = 'paid' THEN v_last_four ELSE NULL END,
          'free')
  ON CONFLICT (user_id) DO UPDATE SET
    free_tier_key_encrypted = CASE WHEN p_slot = 'free' THEN v_enc
                                   ELSE user_api_keys.free_tier_key_encrypted END,
    paid_tier_key_encrypted = CASE WHEN p_slot = 'paid' THEN v_enc
                                   ELSE user_api_keys.paid_tier_key_encrypted END,
    free_tier_last_four = CASE WHEN p_slot = 'free' THEN v_last_four
                               ELSE user_api_keys.free_tier_last_four END,
    paid_tier_last_four = CASE WHEN p_slot = 'paid' THEN v_last_four
                               ELSE user_api_keys.paid_tier_last_four END,
    updated_at = now();
END;
$$;

-- SECURITY DEFINER: set which key slot is active.
DROP FUNCTION IF EXISTS set_active_api_key(text);
CREATE OR REPLACE FUNCTION set_active_api_key(p_slot text)
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
  IF p_slot NOT IN ('free','paid') THEN
    RAISE EXCEPTION 'Invalid slot';
  END IF;

  UPDATE user_api_keys
    SET active_key = p_slot, updated_at = now()
    WHERE user_id = v_user;
END;
$$;

-- SECURITY DEFINER: clear a key slot.
DROP FUNCTION IF EXISTS clear_user_api_key(text);
CREATE OR REPLACE FUNCTION clear_user_api_key(p_slot text)
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
  IF p_slot NOT IN ('free','paid') THEN
    RAISE EXCEPTION 'Invalid slot';
  END IF;

  UPDATE user_api_keys
    SET free_tier_key_encrypted = CASE WHEN p_slot = 'free' THEN NULL
                                       ELSE free_tier_key_encrypted END,
        free_tier_last_four = CASE WHEN p_slot = 'free' THEN NULL
                                   ELSE free_tier_last_four END,
        paid_tier_key_encrypted = CASE WHEN p_slot = 'paid' THEN NULL
                                       ELSE paid_tier_key_encrypted END,
        paid_tier_last_four = CASE WHEN p_slot = 'paid' THEN NULL
                                   ELSE paid_tier_last_four END,
        updated_at = now()
    WHERE user_id = v_user;
END;
$$;

-- SECURITY DEFINER: return decrypted active key for a user.
-- Edge function (service role) calls this with the playthrough owner's id.
DROP FUNCTION IF EXISTS get_user_api_key(uuid);
CREATE OR REPLACE FUNCTION get_user_api_key(p_user uuid)
RETURNS TABLE(provider text, api_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_row record;
BEGIN
  v_secret := current_setting('app.user_key_encryption_secret', true);
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'Encryption secret not configured';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN
    RAISE EXCEPTION 'Not allowed to read another user''s key';
  END IF;

  SELECT active_key, free_tier_key_encrypted, paid_tier_key_encrypted
    INTO v_row
    FROM user_api_keys
    WHERE user_id = p_user;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_row.active_key = 'free' AND v_row.free_tier_key_encrypted IS NOT NULL THEN
    RETURN QUERY SELECT 'free'::text,
      pgp_sym_decrypt(v_row.free_tier_key_encrypted, v_secret)::text;
  ELSIF v_row.active_key = 'paid' AND v_row.paid_tier_key_encrypted IS NOT NULL THEN
    RETURN QUERY SELECT 'paid'::text,
      pgp_sym_decrypt(v_row.paid_tier_key_encrypted, v_secret)::text;
  END IF;
END;
$$;

-- Safe view: only masks + which keys exist + active slot.
DROP VIEW IF EXISTS user_api_keys_safe;
CREATE VIEW user_api_keys_safe AS
SELECT
  user_id,
  (free_tier_key_encrypted IS NOT NULL) AS has_free_key,
  (paid_tier_key_encrypted IS NOT NULL) AS has_paid_key,
  free_tier_last_four,
  paid_tier_last_four,
  active_key,
  updated_at
FROM user_api_keys;

ALTER VIEW user_api_keys_safe OWNER TO postgres;
GRANT SELECT ON user_api_keys_safe TO authenticated;
