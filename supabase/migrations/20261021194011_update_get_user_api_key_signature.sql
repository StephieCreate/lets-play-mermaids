/*
# Update get_user_api_key to accept encryption secret as parameter

## Why
The edge function talks to Postgres over stateless HTTP (supabase-js REST).
Session-level GUCs (current_setting) don't persist across REST calls, so the
original get_user_api_key could not read app.user_key_encryption_secret.

## Change
- Drop the old get_user_api_key(uuid) function.
- Recreate it as get_user_api_key(p_user uuid, p_secret text) so the edge
  function passes the master encryption secret directly in the RPC call.
  This is secure because the edge function runs server-side and the secret
  never reaches the browser.
- The auth.uid() guard still prevents one user from reading another's key
  via the browser. The service role (used by the edge function) bypasses
  that check since auth.uid() is NULL for the service role.
*/

DROP FUNCTION IF EXISTS get_user_api_key(uuid);
DROP FUNCTION IF EXISTS get_user_api_key(uuid, text);

CREATE OR REPLACE FUNCTION get_user_api_key(p_user uuid, p_secret text)
RETURNS TABLE(provider text, api_key text)
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

  -- Browser callers can only read their own key. Service role (auth.uid NULL) is allowed.
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
      pgp_sym_decrypt(v_row.free_tier_key_encrypted, p_secret)::text;
  ELSIF v_row.active_key = 'paid' AND v_row.paid_tier_key_encrypted IS NOT NULL THEN
    RETURN QUERY SELECT 'paid'::text,
      pgp_sym_decrypt(v_row.paid_tier_key_encrypted, p_secret)::text;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_api_key(uuid, text) TO authenticated;
