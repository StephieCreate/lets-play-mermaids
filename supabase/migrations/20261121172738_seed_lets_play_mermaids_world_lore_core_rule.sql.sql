/*
# Seed "Let's Play Mermaids World Lore" as a static core rule document

1. Purpose
- Registers the `lets-play-mermaids-world-lore` rule document (the AI-facing core
  lore reference stored in `public.rule_documents`) for every existing user.
- This is NOT the player-facing Google-Doc "World Lore" tab (`public.world_lore_content`
  / `src/components/WorldLorePage.tsx`); the two features remain fully independent.

2. Modified Tables
- `rule_documents`: inserts one row per existing `DISTINCT user_id` with
  slug = 'lets-play-mermaids-world-lore', title = 'Let''s Play Mermaids World Lore',
  and EMPTY content (existing copies are never overwritten).

3. Security
- No policy changes: the table keeps its existing owner-scoped RLS
  (each authenticated user reads/edits only their own rows), identical to the
  other core rules. `install_store_cartridge` continues to insert this slug
  like any other cartridge rule via its SECURITY DEFINER path.

4. Important Notes
1. The table has UNIQUE (user_id, slug), so `ON CONFLICT (user_id, slug) DO NOTHING`
   makes this migration idempotent and never clobbers existing content.
2. `rule_documents` has no category column; "Universal / Core Rules" grouping is
   expressed in the frontend (`coreRules` array), which already lists this slug.
*/

INSERT INTO rule_documents (user_id, slug, title, content)
SELECT DISTINCT rd.user_id,
       'lets-play-mermaids-world-lore',
       'Let''s Play Mermaids World Lore',
       ''
FROM rule_documents rd
ON CONFLICT (user_id, slug) DO NOTHING;
