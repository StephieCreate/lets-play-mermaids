/*
# Tighten SECURITY DEFINER warnings: lock key decryption to service role, make admin helpers invoker-rights

1. Summary
   Addresses the remaining security-advisor SECURITY DEFINER warnings without changing
   any app behavior. Three targeted changes, verified against all call sites first.

2. public.get_active_ai_key(uuid, text) — EXECUTE restricted to service_role
   - Verified callers: supabase/functions/narrate/index.ts, narrate/devAssistant.ts, and
     rules-helper/index.ts ALL invoke it through createClient(SUPABASE_URL,
     SUPABASE_SERVICE_ROLE_KEY). The browser never calls it (no src/ references).
   - Changed: REVOKE ALL from PUBLIC, anon, authenticated; GRANT EXECUTE to service_role.
   - Kept SECURITY DEFINER with its existing search_path ('public','extensions' — needed
     for pgp_sym_decrypt). This removes the browser's ability to attempt decrypting any
     user's key directly; decryption now happens only inside server-side edge functions.

3. public.is_admin() — SECURITY DEFINER -> SECURITY INVOKER (STABLE)
   - Verified: the function reads ONLY auth.jwt() ->> 'email' (no tables), so running as
     the caller yields identical results — PostgREST supplies the caller's JWT claims
     regardless of function security context.
   - It is referenced inside RLS policies on news_posts and store_cartridges and by the
     frontend/Dev Mode; all run as the signed-in user, so invoker mode is equivalent.
   - The 2-email whitelist is byte-identical: chunmeiguiproduction@gmail.com,
     drxg0n2008's address (drxg0n.2008@gmail.com), case-insensitive. Grants unchanged
     (authenticated only; anon/PUBLIC already revoked).

4. public.publish_store_cartridge(text, text, jsonb) — SECURITY DEFINER -> SECURITY INVOKER
   - Verified: public.store_cartridges already has admin-only RLS policies:
     INSERT WITH CHECK (is_admin() = true), UPDATE USING/WITH CHECK (is_admin() = true),
     DELETE USING (is_admin() = true), and SELECT for (is_active OR is_admin()).
   - As invoker, an admin caller satisfies every policy; non-admins are rejected by RLS
     itself (defense now enforced by policy, not just the in-function check, which is kept).
   - search_path fixed to public. Grant to authenticated unchanged.

5. NOT modified (verified, intentionally left SECURITY DEFINER):
   - delete_my_account(): SET search_path = public; every DELETE scoped to v_user_id := auth.uid().
   - install_store_cartridge(): SET search_path = public; inserts rule_documents with auth.uid().
   - upsert_ai_key(): SET search_path = public, extensions (pgcrypto); inserts with v_user := auth.uid().
   - set_ai_key_auto_delete_exclusion(): SET search_path = public; UPDATE ... WHERE user_id = auth.uid().

6. purge_expired_ai_keys() — deliberately NOT changed in this migration
   - It IS called directly from src/ (AIConfiguration.tsx and UserSettingsModal.tsx, as a
     cleanup before listing keys) and deletes globally (all users' expired keys), not
     scoped to auth.uid(). Tightening it to service_role would break the frontend's
     list-refresh purge. It was already revoked from PUBLIC/anon in the previous
     migration (authenticated + service_role only). Left as-is; reported per instructions.

7. Idempotency & safety
   - CREATE OR REPLACE + REVOKE/GRANT are all re-runnable. No data changes, no policy
     changes, no frontend changes.
*/

-- ---- 1. get_active_ai_key: server-only (edge functions use service_role) ----
REVOKE ALL ON FUNCTION public.get_active_ai_key(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_ai_key(uuid, text) TO service_role;

-- ---- 2. is_admin: invoker-rights (reads only the caller's JWT) ----
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) IN (
    'chunmeiguiproduction@gmail.com',
    'drxg0n.2008@gmail.com'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---- 3. publish_store_cartridge: invoker-rights (admin RLS on store_cartridges enforces access) ----
CREATE OR REPLACE FUNCTION public.publish_store_cartridge(p_version text, p_filename text, p_payload jsonb)
RETURNS store_cartridges
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_row public.store_cartridges;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can publish store cartridges';
  END IF;

  UPDATE public.store_cartridges SET is_active = false WHERE is_active = true;

  INSERT INTO public.store_cartridges (version, filename, payload, is_active, uploaded_by)
  VALUES (p_version, p_filename, p_payload, true, auth.uid())
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_store_cartridge(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_store_cartridge(text, text, jsonb) TO authenticated;
