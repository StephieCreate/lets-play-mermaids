/*
# World Lore Content & Image Storage

1. New Tables
- `public.world_lore_content` — the published World Lore document.
  - `id` (uuid, primary key, default gen_random_uuid())
  - `slug` (text, unique, not null, default 'main' — stable identifier for the lore page)
  - `content` (text, not null, default '' — the rich-text HTML document)
  - `updated_at` (timestamptz, not null, default now())
  - `updated_by` (uuid, references auth.users(id))
  - Seeded with an initial empty 'main' row (idempotent) so first fetches have a baseline.

2. New Storage
- Public bucket `world-lore-images` for lore images (idempotent insert).
- Storage policies on `storage.objects` for that bucket:
  - SELECT (public read): anyone (anon + authenticated).
  - INSERT / UPDATE / DELETE: admins only (`public.is_admin() = true`).

3. Security changes (RLS, policies, grants)
- RLS enabled on `public.world_lore_content`.
- SELECT: public read for `anon` and `authenticated` (lore is intentionally public).
- INSERT / UPDATE / DELETE: admins only (`public.is_admin() = true`), scoped to `authenticated`.
- Grants: SELECT to anon + authenticated; INSERT/UPDATE/DELETE to authenticated only.

4. Important notes
- Non-admins have zero write access to lore content or lore images; admins manage both.
- The bucket is public-read so images render for signed-out visitors.
*/

-- 1. World lore content table
CREATE TABLE IF NOT EXISTS public.world_lore_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL DEFAULT 'main',
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.world_lore_content ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.world_lore_content TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.world_lore_content TO authenticated;

DROP POLICY IF EXISTS "Anyone can read world lore" ON public.world_lore_content;
CREATE POLICY "Anyone can read world lore"
ON public.world_lore_content FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can insert world lore" ON public.world_lore_content;
CREATE POLICY "Admins can insert world lore"
ON public.world_lore_content FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() = true);

DROP POLICY IF EXISTS "Admins can update world lore" ON public.world_lore_content;
CREATE POLICY "Admins can update world lore"
ON public.world_lore_content FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

DROP POLICY IF EXISTS "Admins can delete world lore" ON public.world_lore_content;
CREATE POLICY "Admins can delete world lore"
ON public.world_lore_content FOR DELETE
TO authenticated
USING (public.is_admin() = true);

INSERT INTO public.world_lore_content (slug, content)
VALUES ('main', '')
ON CONFLICT (slug) DO NOTHING;

-- 2. Public storage bucket for lore images
INSERT INTO storage.buckets (id, name, public)
VALUES ('world-lore-images', 'world-lore-images', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies (public read, admin-only writes)
DROP POLICY IF EXISTS "Anyone can read world lore images" ON storage.objects;
CREATE POLICY "Anyone can read world lore images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'world-lore-images');

DROP POLICY IF EXISTS "Admins can upload world lore images" ON storage.objects;
CREATE POLICY "Admins can upload world lore images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'world-lore-images' AND public.is_admin() = true);

DROP POLICY IF EXISTS "Admins can update world lore images" ON storage.objects;
CREATE POLICY "Admins can update world lore images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'world-lore-images' AND public.is_admin() = true)
WITH CHECK (bucket_id = 'world-lore-images' AND public.is_admin() = true);

DROP POLICY IF EXISTS "Admins can delete world lore images" ON storage.objects;
CREATE POLICY "Admins can delete world lore images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'world-lore-images' AND public.is_admin() = true);