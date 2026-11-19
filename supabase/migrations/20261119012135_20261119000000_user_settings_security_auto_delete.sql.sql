/*
# User Settings & Account Security: 30-day API key auto-delete + self-service account deletion

1. Plain-English explanation
- API keys are treated as sensitive, short-lived credentials. By default, any API key
  older than 30 days is automatically purged from the database. A user may explicitly
  opt OUT of auto-deletion for a specific key after accepting a security warning.
- Users can now delete their own account and all associated data from the app without
  contacting support, via a SECURITY DEFINER function that wipes every owned row and
  removes the auth user itself.

2. Modified tables
- `user_ai_keys`: new column `exclude_auto_delete` (boolean, NOT NULL, default false).
  When false, the key is eligible for the 30-day auto-delete purge.

3. Modified views
- `user_ai_keys_safe` recreated to also expose `exclude_auto_delete`. This view masks the
  encrypted key material; column aliases (key_label, masked_key, custom_endpoint) preserved
  to match frontend expectations.

4. New functions
- `purge_expired_ai_keys()` (SECURITY DEFINER): deletes non-excluded keys older than 30 days,
  returns the number deleted. Callable by `authenticated` and `service_role`.
- `set_ai_key_auto_delete_exclusion(p_key_id uuid, p_exclude boolean)` (SECURITY DEFINER):
  lets a user toggle auto-delete exclusion ONLY on their own key. Callable by `authenticated`.
- `delete_my_account()` (SECURITY DEFINER): permanently deletes all rows owned by the caller
  (API keys, custom apexes, chat messages, notes, playthroughs, characters, summaries,
  extras, bug reports, user settings) and then removes the user from `auth.users`.
  NOT callable by `anon`; revoked from PUBLIC.

5. Modified functions
- `get_active_ai_key`: now calls `PERFORM public.purge_expired_ai_keys();` as its first
  statement, so expired keys are purged lazily whenever the backend resolves a key.

6. Security
- RLS state unchanged on existing tables (policies already owner-scoped).
- `delete_my_account` and `set_ai_key_auto_delete_exclusion` revoked from PUBLIC/anon and
  granted to `authenticated` only. `purge_expired_ai_keys` granted to authenticated + service_role.
*/

-- 1. New column on user_ai_keys
ALTER TABLE public.user_ai_keys
  ADD COLUMN IF NOT EXISTS exclude_auto_delete boolean NOT NULL DEFAULT false;

-- 2. Recreate the safe view including the new column (aliases preserved for the frontend)
DROP VIEW IF EXISTS public.user_ai_keys_safe;
CREATE VIEW public.user_ai_keys_safe AS
SELECT
  id,
  user_id,
  label AS key_label,
  provider,
  last_four AS masked_key,
  base_url AS custom_endpoint,
  is_active,
  exclude_auto_delete,
  created_at,
  updated_at
FROM public.user_ai_keys;

GRANT SELECT ON public.user_ai_keys_safe TO authenticated;

-- 3. Purge helper: deletes non-excluded keys older than 30 days
CREATE OR REPLACE FUNCTION public.purge_expired_ai_keys()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.user_ai_keys
    WHERE exclude_auto_delete = false
      AND created_at < (now() - interval '30 days')
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_expired_ai_keys() TO authenticated, service_role;

-- 4. Toggle auto-delete exclusion (owner-only)
CREATE OR REPLACE FUNCTION public.set_ai_key_auto_delete_exclusion(p_key_id uuid, p_exclude boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_ai_keys
  SET exclude_auto_delete = p_exclude,
      updated_at = now()
  WHERE id = p_key_id
    AND user_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_ai_key_auto_delete_exclusion(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ai_key_auto_delete_exclusion(uuid, boolean) TO authenticated;

-- 5. Self-service account deletion: wipes all owned data, then the auth user
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.user_ai_keys WHERE user_id = v_user_id;
  DELETE FROM public.user_custom_apexes WHERE user_id = v_user_id;
  DELETE FROM public.chat_messages WHERE playthrough_id IN (SELECT id FROM public.playthroughs WHERE user_id = v_user_id);
  DELETE FROM public.playthrough_notes WHERE playthrough_id IN (SELECT id FROM public.playthroughs WHERE user_id = v_user_id);
  DELETE FROM public.narrative_summaries WHERE user_id = v_user_id;
  DELETE FROM public.extra_contents WHERE user_id = v_user_id;
  DELETE FROM public.bug_reports WHERE user_id = v_user_id;
  DELETE FROM public.user_settings WHERE user_id = v_user_id;
  DELETE FROM public.playthroughs WHERE user_id = v_user_id;
  DELETE FROM public.characters WHERE user_id = v_user_id;

  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- 6. get_active_ai_key: purge expired keys first, then resolve the active key
CREATE OR REPLACE FUNCTION public.get_active_ai_key(p_user uuid, p_secret text)
RETURNS TABLE (provider text, api_key text, base_url text, label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
