/*
# Fix: upsert_ai_key must be SECURITY DEFINER

## Problem
`upsert_ai_key()` reads the master encryption secret from `app_secrets`.
The lockdown migration (20261021194106) correctly revoked all privileges on
`app_secrets` from `anon` and `authenticated` so the frontend can never read
the encryption key directly. However, `upsert_ai_key` was NOT `SECURITY DEFINER`,
so it ran as the calling `authenticated` role — which now has zero access to
`app_secrets`, causing "permission denied for table app_secrets" every time a
user tries to save an API key.

## Fix
Recreate `upsert_ai_key` as `SECURITY DEFINER` with `search_path = public`.
It runs as the table owner (postgres), bypassing RLS on `app_secrets` to read
the encryption secret. The INSERT into `user_ai_keys` still uses `auth.uid()`
from the caller's JWT, so ownership is preserved. Revoke execute from
PUBLIC/anon; grant to authenticated only.

## Security notes
- The function still validates `auth.uid()` is not null (not authenticated check).
- The function still validates provider and key length.
- Only `authenticated` can call it.
- `app_secrets` is only readable by the owner/service_role/this function — never by the client directly.
*/

CREATE OR REPLACE FUNCTION public.upsert_ai_key(p_label text, p_provider text, p_key text, p_base_url text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
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
  IF p_provider NOT IN ('deepseek','openai','gemini','claude','custom') THEN
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

REVOKE EXECUTE ON FUNCTION public.upsert_ai_key(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_ai_key(text, text, text, text) TO authenticated;
