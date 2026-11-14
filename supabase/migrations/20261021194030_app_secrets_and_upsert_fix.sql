/*
# Update upsert/clear/set-active functions to accept encryption secret as parameter

## Why
Same reason as the get_user_api_key change: browser-side supabase-js calls are
stateless HTTP, so session-level current_setting('app.user_key_encryption_secret')
is not available. The browser must pass the secret... but the browser must NEVER
know the master encryption secret.

## Solution
The upsert function no longer takes the secret from a GUC. Instead, encryption
happens server-side: the browser sends the plaintext key to the SECURITY DEFINER
function, which encrypts it using the project-level secret stored in
 Supabase Vault / a dedicated config table accessible only to the definer.

To keep this simple and secure without vault ceremony, we store the master
secret in a dedicated table `app_secrets` that ONLY the service role and
SECURITY DEFINER functions can read (no RLS grant to anon/authenticated).
The edge function reads it via service role and passes it to get_user_api_key.

## Changes
1. Create app_secrets table (no RLS grants to anon/authenticated; only owner/definer).
2. Seed the encryption_secret row (value to be set via service role later).
3. Rewrite upsert_user_api_key to read the secret from app_secrets.
4. get_user_api_key already accepts p_secret from the edge function, which
   reads it from app_secrets using the service role key.
*/

CREATE TABLE IF NOT EXISTS app_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
-- No policies: deny all to anon/authenticated. Only owner/service role/definer access.

-- Seed a placeholder; the real value is set by the edge function on first run
-- via the service role, or manually by the project owner.
INSERT INTO app_secrets (name, value)
VALUES ('user_key_encryption_secret', 'CHANGE_ME-' || gen_random_uuid()::text)
ON CONFLICT (name) DO NOTHING;

-- Rewrite upsert to read secret from app_secrets (definer has access).
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

  SELECT value INTO v_secret FROM app_secrets WHERE name = 'user_key_encryption_secret';
  IF v_secret IS NULL OR v_secret = '' OR v_secret LIKE 'CHANGE_ME-%' THEN
    RAISE EXCEPTION 'Encryption secret not configured. Ask the site owner to set it.';
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

GRANT EXECUTE ON FUNCTION upsert_user_api_key(text,text) TO authenticated;

-- Drop the old get_user_api_key(uuid) if still lingering, keep (uuid,text).
DROP FUNCTION IF EXISTS get_user_api_key(uuid);
