/*
# Create assistant_chat_messages (cross-device chat persistence)

1. New Tables
- `assistant_chat_messages`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `user_id` (uuid, NOT NULL, references auth.users, on delete cascade)
  - `chat_type` (text, NOT NULL, check: 'rules_helper' | 'dev_assistant')
  - `role` (text, NOT NULL, check: 'user' | 'assistant')
  - `content` (text, NOT NULL)
  - `metadata` (jsonb, NOT NULL, default '{}') — e.g. { sources, usedCharacters, characterNames }
  - `created_at` (timestamptz, NOT NULL, default now())
  - Keeps `chat_messages` strictly for gameplay playthroughs.

2. Security
- RLS enabled. Three policies, all scoped to the row owner via auth.uid():
  - SELECT: own rows only; dev_assistant rows additionally require is_admin().
  - INSERT: own rows only; dev_assistant rows additionally require is_admin().
  - DELETE: own rows only; dev_assistant rows additionally require is_admin().
- No UPDATE policy: saved chat bubbles are immutable once written; players can
  only delete and re-ask.
- Grants: SELECT, INSERT, DELETE on the table to authenticated only (no anon —
  both chats require sign-in). service_role needs no grant (no edge function use).

3. Performance
- Index `idx_assistant_chat_messages_user_type_created` on
  (user_id, chat_type, created_at ASC) for the ordered history fetch.

4. Notes
- Idempotent: IF NOT EXISTS on table/index, drop-first on policies.
*/

CREATE TABLE IF NOT EXISTS public.assistant_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_type text NOT NULL CHECK (chat_type IN ('rules_helper', 'dev_assistant')),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_chat_messages_user_type_created
  ON public.assistant_chat_messages (user_id, chat_type, created_at ASC);

ALTER TABLE public.assistant_chat_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.assistant_chat_messages TO authenticated;

DROP POLICY IF EXISTS "Users can read own assistant chat messages" ON public.assistant_chat_messages;
CREATE POLICY "Users can read own assistant chat messages"
  ON public.assistant_chat_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND (chat_type <> 'dev_assistant' OR public.is_admin()));

DROP POLICY IF EXISTS "Users can insert own assistant chat messages" ON public.assistant_chat_messages;
CREATE POLICY "Users can insert own assistant chat messages"
  ON public.assistant_chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (chat_type <> 'dev_assistant' OR public.is_admin()));

DROP POLICY IF EXISTS "Users can delete own assistant chat messages" ON public.assistant_chat_messages;
CREATE POLICY "Users can delete own assistant chat messages"
  ON public.assistant_chat_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND (chat_type <> 'dev_assistant' OR public.is_admin()));