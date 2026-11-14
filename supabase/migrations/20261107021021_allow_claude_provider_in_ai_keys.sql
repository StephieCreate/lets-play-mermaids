/*
# Allow Anthropic Claude as an AI provider

1. Modified Tables
- `user_ai_keys`: the provider check constraint now accepts 'claude' in addition to 'deepseek', 'openai', 'gemini', and 'custom'.

2. Modified Functions
- `upsert_ai_key`: the provider validation now accepts 'claude'. The body is otherwise unchanged (same encryption, same active-key behavior).

3. Security
- No changes to RLS policies or grants. Keys are still encrypted and only readable through the existing secure functions.

4. Notes
- Existing rows are untouched; only the allowed set of values grows.
*/

ALTER TABLE user_ai_keys DROP CONSTRAINT IF EXISTS user_ai_keys_provider_check;
ALTER TABLE user_ai_keys ADD CONSTRAINT user_ai_keys_provider_check
  CHECK (provider = ANY (ARRAY['deepseek'::text, 'openai'::text, 'gemini'::text, 'claude'::text, 'custom'::text]));

CREATE OR REPLACE FUNCTION public.upsert_ai_key(p_label text, p_provider text, p_key text, p_base_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$;
