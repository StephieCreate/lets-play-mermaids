/*
# Add AI provider/model preferences to user_settings

1. Plain-English summary
   - Players choose an AI provider (DeepSeek, OpenAI, Gemini, Claude, custom) and a
     specific model (e.g. `deepseek-flash`, `deepseek-v4-pro`) in AI Configuration.
   - That choice previously lived only in the browser's local storage, so it reset on
     cache clears and never followed the player to another device.
   - This migration adds two columns to the existing, already RLS-protected
     `user_settings` table so the choice is stored server-side, survives reloads,
     and syncs across devices. API keys are NOT touched — they stay encrypted in
     `user_ai_keys` exactly as before.

2. Modified tables
   - `public.user_settings`
     - ADD COLUMN `ai_provider` text NULL — the selected provider id
       ('deepseek' | 'openai' | 'gemini' | 'claude' | 'custom').
     - ADD COLUMN `ai_model` text NULL — the selected model id
       (e.g. 'deepseek-flash', 'deepseek-v4-pro'). NULL means "provider default".

3. Security changes
   - None. RLS was already enabled and the existing owner-scoped policies
     (select/insert/update own row via `auth.uid() = user_id`) apply to the new
     columns automatically because grants are table-wide for `authenticated`.

4. Important notes
   - Columns are nullable: existing rows keep working; the app treats NULL as
     "no saved preference yet".
   - Idempotent via IF NOT EXISTS — safe to re-run.
*/

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS ai_provider text,
  ADD COLUMN IF NOT EXISTS ai_model text;