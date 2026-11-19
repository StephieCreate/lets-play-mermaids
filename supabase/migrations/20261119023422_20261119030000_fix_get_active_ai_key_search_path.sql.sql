/*
# Fix: get_active_ai_key search_path must include extensions schema

## Problem
`get_active_ai_key()` calls `pgp_sym_decrypt()` to decrypt the user's API key.
`pgp_sym_decrypt` lives in the `extensions` schema (from the pgcrypto extension).
The function's `search_path` was set to only `public`, so it could not resolve
`pgp_sym_decrypt` at call time, causing the function to error silently and
return no rows. The edge function then sees no active key and returns
"No AI API key found" to the player.

## Fix
Recreate `get_active_ai_key` with `search_path = public, extensions` so the
pgcrypto function resolves correctly. Function body and permissions unchanged
except for the search_path setting.
*/

CREATE OR REPLACE FUNCTION public.get_active_ai_key(p_user uuid, p_secret text)
RETURNS TABLE (provider text, api_key text, base_url text, label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row record;
BEGIN
  PERFORM public.purge_expired_ai_keys();

  IF p_secret IS NULL OR p_secret = '' THEN
    RAISE EXCEPTION 'Encryption secret not provided';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN
    RAISE EXCEPTION 'Not allowed to read another user''s key';
  END IF;

  SELECT k.provider, k.api_key_encrypted, k.base_url, k.label
  INTO v_row
  FROM user_ai_keys k
  WHERE k.user_id = p_user AND k.is_active = true
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

REVOKE EXECUTE ON FUNCTION public.get_active_ai_key(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_ai_key(uuid, text) TO authenticated, service_role;
