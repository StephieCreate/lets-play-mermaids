/*
# Store Cartridges, Admin-Only Rule Writes & Install RPCs

1. New Tables
- `public.store_cartridges` — official versioned rule cartridges published to the Store tab.
  - `id` (uuid, primary key, default gen_random_uuid())
  - `version` (text, not null, e.g. "1.4")
  - `filename` (text, not null, e.g. "dark-ocean-rules-v1.4.json")
  - `payload` (jsonb, not null, cartridge JSON containing a rules array)
  - `is_active` (boolean, not null, default true — only one active cartridge at a time)
  - `uploaded_at` (timestamptz, not null, default now())
  - `uploaded_by` (uuid, references auth.users(id))

2. Security changes (RLS, policies, grants)
- RLS enabled on `public.store_cartridges`.
- SELECT: all authenticated users can read active cartridges; admins can read all rows.
- INSERT / UPDATE / DELETE: admins only (`public.is_admin() = true`).
- `public.rule_documents` write policies tightened: direct client INSERT/UPDATE/DELETE now
  require `public.is_admin() = true`. SELECT stays owner-scoped (`auth.uid() = user_id`),
  so every signed-in player can still read their own ruleset.
- New SECURITY DEFINER RPC `public.install_store_cartridge(p_cartridge_id uuid DEFAULT NULL)`
  (granted to authenticated): installs the requested (or current active) store cartridge into
  the caller's own ruleset by upserting each rule in the payload, bypassing the write lock
  safely server-side. Returns version, installed_count, and rules.
- New SECURITY DEFINER RPC `public.publish_store_cartridge(p_version text, p_filename text,
  p_payload jsonb)` (admin-only, raises an exception otherwise): atomically deactivates all
  existing cartridges and inserts the new active one.

3. Important notes
- One active cartridge invariant is enforced inside publish_store_cartridge.
- install_store_cartridge validates the caller is authenticated and only writes rows owned
  by auth.uid(), so players can never modify another user's ruleset.
*/

-- 1. Store cartridges table
CREATE TABLE IF NOT EXISTS public.store_cartridges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  filename text NOT NULL,
  payload jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.store_cartridges ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.store_cartridges TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.store_cartridges TO authenticated;

DROP POLICY IF EXISTS "Anyone authenticated can read active cartridges" ON public.store_cartridges;
CREATE POLICY "Anyone authenticated can read active cartridges"
ON public.store_cartridges FOR SELECT
TO authenticated
USING (is_active = true OR public.is_admin() = true);

DROP POLICY IF EXISTS "Admins can insert cartridges" ON public.store_cartridges;
CREATE POLICY "Admins can insert cartridges"
ON public.store_cartridges FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() = true);

DROP POLICY IF EXISTS "Admins can update cartridges" ON public.store_cartridges;
CREATE POLICY "Admins can update cartridges"
ON public.store_cartridges FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

DROP POLICY IF EXISTS "Admins can delete cartridges" ON public.store_cartridges;
CREATE POLICY "Admins can delete cartridges"
ON public.store_cartridges FOR DELETE
TO authenticated
USING (public.is_admin() = true);

-- 2. Non-admin read-only lock on rule_documents (SELECT stays owner-scoped)
DROP POLICY IF EXISTS "insert_own_rule_documents" ON public.rule_documents;
CREATE POLICY "insert_own_rule_documents"
ON public.rule_documents FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_admin() = true);

DROP POLICY IF EXISTS "update_own_rule_documents" ON public.rule_documents;
CREATE POLICY "update_own_rule_documents"
ON public.rule_documents FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.is_admin() = true)
WITH CHECK (auth.uid() = user_id AND public.is_admin() = true);

DROP POLICY IF EXISTS "delete_own_rule_documents" ON public.rule_documents;
CREATE POLICY "delete_own_rule_documents"
ON public.rule_documents FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.is_admin() = true);

-- 3. Admin-only publish RPC (atomic deactivate + insert)
CREATE OR REPLACE FUNCTION public.publish_store_cartridge(
  p_version text,
  p_filename text,
  p_payload jsonb
)
RETURNS public.store_cartridges
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 4. Install RPC: upserts the cartridge rules into the caller's own ruleset
CREATE OR REPLACE FUNCTION public.install_store_cartridge(
  p_cartridge_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cartridge_row public.store_cartridges;
  rule_item jsonb;
  installed int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_cartridge_id IS NULL THEN
    SELECT * INTO cartridge_row
    FROM public.store_cartridges
    WHERE is_active = true
    ORDER BY uploaded_at DESC
    LIMIT 1;
  ELSE
    SELECT * INTO cartridge_row
    FROM public.store_cartridges
    WHERE id = p_cartridge_id AND is_active = true
    LIMIT 1;
  END IF;

  IF cartridge_row.id IS NULL THEN
    RAISE EXCEPTION 'No active store cartridge found';
  END IF;

  FOR rule_item IN
    SELECT jsonb_array_elements(cartridge_row.payload -> 'rules')
  LOOP
    INSERT INTO public.rule_documents (user_id, slug, title, content, updated_at)
    VALUES (
      auth.uid(),
      rule_item ->> 'slug',
      rule_item ->> 'title',
      rule_item ->> 'content',
      now()
    )
    ON CONFLICT (user_id, slug)
    DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      updated_at = now();
    installed := installed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'version', cartridge_row.version,
    'installed_count', installed,
    'rules', cartridge_row.payload -> 'rules'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.install_store_cartridge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.install_store_cartridge(uuid) TO authenticated;