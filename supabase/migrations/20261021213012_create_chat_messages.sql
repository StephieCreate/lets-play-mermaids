/*
# Create chat_messages table for persistent chat history

1. New Tables
- `chat_messages`
  - `id` (uuid, primary key)
  - `playthrough_id` (uuid, foreign key to playthroughs, cascade delete)
  - `user_id` (uuid, not null, defaults to auth.uid() — owner of the playthrough)
  - `role` (text, not null — 'player' or 'narrator')
  - `content` (text, not null — the message text)
  - `created_at` (timestamptz, defaults to now())
  - `seq` (integer, not null — ordering within a playthrough)

2. Security
- Enable RLS on `chat_messages`.
- Owner-scoped CRUD: each authenticated user can only access messages for their own playthroughs.
- Ownership is checked via the playthrough's user_id through a subquery.

3. Indexes
- Index on `playthrough_id` + `seq` for efficient ordered retrieval.
*/

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playthrough_id uuid NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  role text NOT NULL CHECK (role IN ('player', 'narrator')),
  content text NOT NULL,
  seq integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_playthrough_seq
  ON chat_messages (playthrough_id, seq);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_chat_messages" ON chat_messages;
CREATE POLICY "select_own_chat_messages"
ON chat_messages FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM playthroughs WHERE playthroughs.id = chat_messages.playthrough_id AND playthroughs.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_chat_messages" ON chat_messages;
CREATE POLICY "insert_own_chat_messages"
ON chat_messages FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM playthroughs WHERE playthroughs.id = chat_messages.playthrough_id AND playthroughs.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_chat_messages" ON chat_messages;
CREATE POLICY "delete_own_chat_messages"
ON chat_messages FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM playthroughs WHERE playthroughs.id = chat_messages.playthrough_id AND playthroughs.user_id = auth.uid()));
