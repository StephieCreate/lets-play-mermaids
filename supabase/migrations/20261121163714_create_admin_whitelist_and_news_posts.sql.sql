/*
# Admin Whitelist & Database-Backed News Posts

1. Admin Whitelist Helper
- Adds `public.is_admin()`, a SECURITY DEFINER helper that returns true ONLY for the two
  whitelisted admin emails (chunmeiguiproduction@gmail.com, drxg0n.2008@gmail.com), compared
  case-insensitively against the signed-in user's JWT email. Executable by `authenticated` only.
- The reserved regular-player test account (stephanielandrycreate@gmail.com) is intentionally
  NOT whitelisted.

2. New Tables
- `public.news_posts` — Alpha/Beta update posts shown in the News tab.
  - `id` (uuid, primary key, default gen_random_uuid())
  - `slug` (text, unique, stable identifier for seeded posts)
  - `phase` (text, not null, e.g. "Phase 6")
  - `title` (text, not null)
  - `content` (text, not null)
  - `created_at` (timestamptz, not null, default now())
  - `created_by` (uuid, references auth.users(id))
  - Seeded with Phases 1-6 (idempotent via ON CONFLICT (slug) DO NOTHING) using ascending
    created_at timestamps so Phase 6 appears first when sorted newest-first.

3. Security (RLS, policies, grants)
- RLS enabled on `public.news_posts`.
- SELECT: public read for `anon` and `authenticated` (news is intentionally public).
- INSERT / UPDATE / DELETE: admins only (`public.is_admin() = true`), scoped to `authenticated`.
- Grants: SELECT to anon + authenticated; INSERT/UPDATE/DELETE to authenticated only.
- `public.is_admin()` granted to `authenticated`, revoked from PUBLIC/anon.
*/

-- 1. Admin whitelist helper
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) IN (
    'chunmeiguiproduction@gmail.com',
    'drxg0n.2008@gmail.com'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 2. News posts table
CREATE TABLE IF NOT EXISTS public.news_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE,
  phase text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.news_posts ENABLE ROW LEVEL SECURITY;

-- Grants (Data API reachability)
GRANT SELECT ON public.news_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.news_posts TO authenticated;

-- Policies (drop-first for idempotency)
DROP POLICY IF EXISTS "Anyone can read news posts" ON public.news_posts;
CREATE POLICY "Anyone can read news posts"
ON public.news_posts FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can insert news posts" ON public.news_posts;
CREATE POLICY "Admins can insert news posts"
ON public.news_posts FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() = true);

DROP POLICY IF EXISTS "Admins can update news posts" ON public.news_posts;
CREATE POLICY "Admins can update news posts"
ON public.news_posts FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

DROP POLICY IF EXISTS "Admins can delete news posts" ON public.news_posts;
CREATE POLICY "Admins can delete news posts"
ON public.news_posts FOR DELETE
TO authenticated
USING (public.is_admin() = true);

-- 3. Seed Phases 1-6 (ascending timestamps so Phase 6 is newest)
INSERT INTO public.news_posts (slug, phase, title, content, created_at) VALUES
('phase-1', 'Phase 1', 'Initial Alpha Launch',
 'Core rules integration, Grotto Registry splits, and robust DeepSeek Pro baseline logic fully established. Welcome to the deep ocean!',
 now() - interval '6 days'),
('phase-2', 'Phase 2', 'Multi-Model AI Configuration & Cost Estimator',
 'Added a BYOK cost estimator widget, local AI support (Ollama/LM Studio via Custom endpoints), and key-specific model preference dropdowns.',
 now() - interval '5 days'),
('phase-3', 'Phase 3', 'Tetris Bag RNG & Markov Weather Active',
 'Replaced raw d20/d10 rolls with the Tetris Bag encounter deck and Markov Weather Fronts to ensure smooth meteorological transitions and eliminate 5-day death spirals.',
 now() - interval '4 days'),
('phase-4', 'Phase 4', 'Apexes Needing Testing',
 'Apexes are currently tested for female player characters under 9 ft: Kial, Severin, Ezra, and Malibu. All other sizes and gender ranges have not been tested for any Apexes yet. Ricsa and Idris still need extensive playtesting to determine whether they are stable or need Dev adjustments—Idris features a unique new mechanic in the Game Master system, and Ricsa pushes the waystation mechanics to their limits. Akuma and Vanna are currently being brainstormed and should be up within a month or two. Playtesters can message Stephie directly on Discord or use the in-app bug reporting button!',
 now() - interval '3 days'),
('phase-5', 'Phase 5', 'Live Playtesting, Status Bars & Cartridge Hub',
 'The app is officially published and live for Discord playtesters, with full backend API key encryption locked in. New Feature Alert: Interactive status bars (Stm, HP, Lvl, and Bond) are now live at the top of the play screen! Since this is brand-new, please keep an eye on them to make sure they update smoothly with your turns—you can tap any pill to manually adjust your numbers or hit Sync from Save & Chat if they ever drift, and report any hiccups. Next up is an in-app Store section so playtesters can always grab the most current game cartridge file as mechanics are tuned. Down the road, it will include an optional ''Pay What You Want'' (up to $15) button to support development, though checkout won''t be wired up until much later.',
 now() - interval '2 days'),
('phase-6', 'Phase 6', 'Account Security, 30-Day Key Protection & News Hub',
 'Added a full User Settings & Security hub! For your protection, saved API keys now automatically delete after 30 days (with an optional ''Exclude from auto-delete'' toggle in AI Config if you prefer long-term storage). We also added Forgot Password email recovery, a 90-day password rotation tracker, and a self-service ''Delete My Account'' option under Danger Zone that permanently wipes all keys, characters, and playthrough data. Finally, Alpha/Beta updates now live right here in the News tab—tap ''Mark as Read'' below to clear the red notification badge!',
 now() - interval '1 day')
ON CONFLICT (slug) DO NOTHING;