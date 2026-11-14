-- Fix: column reference "provider" is ambiguous inside get_active_ai_key.
-- The RETURNS TABLE columns (provider, base_url, label) shadow the table
-- columns of the same name in the inner SELECT. Table-alias the inner
-- query columns to disambiguate.

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
SET search_path = public, extensions
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
GRANT EXECUTE ON FUNCTION get_active_ai_key(uuid, text) TO authenticated;
