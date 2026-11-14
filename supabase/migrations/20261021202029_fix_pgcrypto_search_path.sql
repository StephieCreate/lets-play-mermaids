-- Fix: pgcrypto functions live in the `extensions` schema, but the
-- SECURITY DEFINER functions set search_path = public only, so they
-- can't find pgp_sym_encrypt/pgp_sym_decrypt. Update search_path to
-- include both `extensions` and `public`.

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
SET search_path = public, extensions
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

-- get_active_ai_key also needs to find pgp_sym_decrypt
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
