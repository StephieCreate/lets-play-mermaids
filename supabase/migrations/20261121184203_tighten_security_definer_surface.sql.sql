/*
# Tighten SECURITY DEFINER surface (ai keys, cartridges, admin, account deletion)

1. Summary
   Fixes security advisor findings about SECURITY DEFINER objects reachable through
   the Data API. No table data changes; access control only.

2. View: public.user_ai_keys_safe
   - Previously a default (SECURITY DEFINER) view owned by `postgres`, so RLS on the
     base table user_ai_keys was NOT applied to reads through the view.
   - Recreated as `WITH (security_invoker = true)` so every read through the view
     runs with the caller's role and the base table's owner-scoped RLS applies.
   - EXPOSED LEAK THIS CLOSES: the view was SELECT-able by `anon` (grants were
     inherited from the base table). A signed-out visitor could list every user's
     key metadata (provider, last-four, endpoint). After this migration the view is
     revoked from `anon` and granted to `authenticated` + `service_role` only.
   - View column aliases are unchanged (key_label, masked_key, custom_endpoint), so
     no application code changes are needed.

3. Function: public.purge_expired_ai_keys()
   - Maintenance helper that deletes inactive, non-excluded AI keys older than 30
     days. It is also called internally by get_active_ai_key, and the frontend
     calls it as a cleanup before listing keys.
   - Previously EXECUTE-able by `anon` and `PUBLIC`: a signed-out visitor could
     trigger global key deletion.
   - Revoked from PUBLIC/anon; granted to `authenticated` + `service_role` only.
   - Kept SECURITY DEFINER: it must delete rows regardless of any single user's
     ownership scope. No user-controlled arguments exist, so there is nothing a
     caller can aim at another user's data.

4. Functions whose EXECUTE for `authenticated` is INTENTIONAL and retained
   (advisor items triaged, not changed — each derives the actor from auth.uid(),
   never from caller-supplied parameters, and all have fixed search_path):
   - delete_my_account(): deletes ONLY the caller's own rows (auth.uid()).
   - get_active_ai_key(p_user, p_secret): rejects any p_user other than the
     caller's auth.uid(); used legitimately by edge functions via service_role.
   - install_store_cartridge(): installs into the caller's own rule_documents.
   - is_admin(): read-only email whitelist check; safe to call.
   - publish_store_cartridge(): verifies is_admin() internally.
   - upsert_ai_key(): inserts only for auth.uid().
   - set_ai_key_auto_delete_exclusion(): updates only rows owned by auth.uid().

5. Security notes
   - No RLS or policy changes; policies on user_ai_keys, store_cartridges,
     app_secrets are unchanged and remain deny-by-default.
   - Idempotent: DROP/CREATE for the view, IF EXISTS revokes, explicit grants.
*/

-- ---- View: force RLS to apply (security_invoker), lock to authenticated ----
DROP VIEW IF EXISTS public.user_ai_keys_safe;
CREATE VIEW public.user_ai_keys_safe
WITH (security_invoker = true) AS
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

REVOKE ALL ON public.user_ai_keys_safe FROM PUBLIC, anon;
GRANT SELECT ON public.user_ai_keys_safe TO authenticated, service_role;

-- ---- Function: purge_expired_ai_keys (no longer callable signed-out) ----
REVOKE EXECUTE ON FUNCTION public.purge_expired_ai_keys() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_expired_ai_keys() TO authenticated, service_role;
