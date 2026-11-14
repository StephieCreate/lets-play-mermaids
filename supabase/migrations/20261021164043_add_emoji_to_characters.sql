/*
# Add emoji column to characters

1. Modified Tables
- `characters` gains an `emoji` text column (nullable) used as a small
  organizational marker the player picks during character creation.
- Defaults to NULL so existing rows are unaffected.

2. Security
- No policy changes. The existing owner-scoped CRUD policies on
  `characters` already cover the new column because they are row-level
  (not column-level) checks.

3. Important Notes
1. The column is nullable so older characters created before this
   migration keep working without a value.
2. The frontend writes `emoji` during character creation and reads it
   back on the roster card.
*/

ALTER TABLE characters ADD COLUMN IF NOT EXISTS emoji text;
