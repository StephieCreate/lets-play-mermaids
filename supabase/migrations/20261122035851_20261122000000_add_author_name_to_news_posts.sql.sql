/*
# Add author_name to news_posts

1. Modified Tables
- `news_posts`
  - New column `author_name text` (nullable) — optional display name of the
    admin who wrote the post ("Torva" or "Stephana"). Null on older posts,
    which simply render without a byline.

2. Security
- No RLS changes. Existing policies are untouched:
  - "Anyone can read news posts" (SELECT for anon + authenticated)
  - Admin-only INSERT/UPDATE/DELETE via is_admin().
- Existing table-level grants cover the new column automatically; a nullable
  optional column needs no column-restricted grants.

3. Notes
- Idempotent via ADD COLUMN IF NOT EXISTS.
*/

ALTER TABLE public.news_posts
  ADD COLUMN IF NOT EXISTS author_name text;