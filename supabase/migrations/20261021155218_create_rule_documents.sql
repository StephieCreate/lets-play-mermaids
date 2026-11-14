/*
# Create owner-scoped rule documents

1. New Tables
- `rule_documents` stores the three core rules documents for each signed-in user.
- `id` is the unique document identifier.
- `user_id` identifies the authenticated owner and defaults to the current session user.
- `slug` identifies one of the fixed core rule tabs.
- `title` stores the display name shown on the tab and document heading.
- `content` stores the user's pasted markdown text.
- `created_at` and `updated_at` track document history.

2. Security
- Row level security is enabled on `rule_documents`.
- Each CRUD action is restricted to authenticated users and their own rows.
- Anonymous visitors cannot read or change private rule documents.

3. Important Notes
1. The frontend omits `user_id` when creating a document so ownership always comes from `auth.uid()`.
2. A unique constraint prevents duplicate copies of the same core rule document per user.
3. The document content is plain markdown text and is not rendered as HTML by this change.
*/

CREATE TABLE IF NOT EXISTS rule_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rule_documents_user_slug_key UNIQUE (user_id, slug)
);

ALTER TABLE rule_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_rule_documents" ON rule_documents;
CREATE POLICY "select_own_rule_documents" ON rule_documents FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_rule_documents" ON rule_documents;
CREATE POLICY "insert_own_rule_documents" ON rule_documents FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_rule_documents" ON rule_documents;
CREATE POLICY "update_own_rule_documents" ON rule_documents FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_rule_documents" ON rule_documents;
CREATE POLICY "delete_own_rule_documents" ON rule_documents FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_rule_documents_user_id ON rule_documents(user_id);
