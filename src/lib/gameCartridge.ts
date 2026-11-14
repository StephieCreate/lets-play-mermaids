import { supabase } from '@/lib/supabase';

const CARTRIDGE_FORMAT = 'mermaids-game-cartridge';
const CARTRIDGE_VERSION = 2;
export const MAX_CARTRIDGE_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 50;
const MAX_TEXT_LENGTH = 200_000;
const MAX_TITLE_LENGTH = 200;
const MAX_SLUG_LENGTH = 100;
const SENSITIVE_KEYS = new Set(['api_key', 'key', 'secret', 'token', 'password']);

export interface CartridgeRule {
  slug: string;
  title: string;
  content: string;
}

export interface ParsedCartridge {
  rules: CartridgeRule[];
  removedSensitive: number;
  skippedEntries: number;
}

export interface CartridgeImportResult {
  added: CartridgeRule[];
  updated: CartridgeRule[];
}

export function scrubSensitiveKeys(input: unknown): { value: unknown; removed: number } {
  if (Array.isArray(input)) {
    let removed = 0;
    const value = input.map((item) => {
      const result = scrubSensitiveKeys(item);
      removed += result.removed;
      return result.value;
    });
    return { value, removed };
  }

  if (input !== null && typeof input === 'object') {
    let removed = 0;
    const value: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(input)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        removed += 1;
        continue;
      }
      const result = scrubSensitiveKeys(child);
      removed += result.removed;
      value[key] = result.value;
    }
    return { value, removed };
  }

  return { value: input, removed: 0 };
}

export async function exportCartridge(): Promise<string> {
  const { data, error } = await supabase.from('rule_documents').select('slug, title, content');

  if (error) {
    console.error('Cartridge export read failed', error);
    throw new Error('Your rules could not be read for export.');
  }

  const rules: CartridgeRule[] = (data ?? []).map((row) => ({
    slug: row.slug,
    title: row.title,
    content: row.content,
  }));

  const cartridge = {
    format: CARTRIDGE_FORMAT,
    version: CARTRIDGE_VERSION,
    exportedAt: new Date().toISOString(),
    rules,
  };

  return JSON.stringify(scrubSensitiveKeys(cartridge).value, null, 2);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isContentString(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH;
}

export function parseCartridge(text: string): ParsedCartridge {
  const scrubbed = scrubSensitiveKeys(JSON.parse(text));
  const data = scrubbed.value as { rules?: unknown } | null;

  if (!data || typeof data !== 'object' || !Array.isArray(data.rules)) {
    throw new Error('This file is not a valid game cartridge.');
  }

  const rawRules = data.rules.slice(0, MAX_ENTRIES);
  const seenSlugs = new Set<string>();
  const rules: CartridgeRule[] = [];

  for (const item of rawRules) {
    const entry = item as Partial<Record<keyof CartridgeRule, unknown>>;
    if (
      !isNonEmptyString(entry.slug, MAX_SLUG_LENGTH) ||
      !isNonEmptyString(entry.title, MAX_TITLE_LENGTH) ||
      !isContentString(entry.content) ||
      seenSlugs.has(entry.slug)
    ) {
      continue;
    }
    seenSlugs.add(entry.slug);
    rules.push({ slug: entry.slug, title: entry.title, content: entry.content });
  }

  return {
    rules,
    removedSensitive: scrubbed.removed,
    skippedEntries: data.rules.length - rules.length,
  };
}

export async function importCartridge(userId: string, cartridge: ParsedCartridge): Promise<CartridgeImportResult> {
  const { data: existingRows, error: existingError } = await supabase
    .from('rule_documents')
    .select('slug');
  if (existingError) {
    console.error('Cartridge import could not read existing rules', existingError);
    throw new Error('Your rules could not be checked before importing.');
  }

  const existingSlugs = new Set((existingRows ?? []).map((row) => row.slug as string));
  const added = cartridge.rules.filter((rule) => !existingSlugs.has(rule.slug));
  const updated = cartridge.rules.filter((rule) => existingSlugs.has(rule.slug));

  if (cartridge.rules.length > 0) {
    const { error: upsertError } = await supabase.from('rule_documents').upsert(
      cartridge.rules.map((rule) => ({
        user_id: userId,
        slug: rule.slug,
        title: rule.title,
        content: rule.content,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,slug' },
    );
    if (upsertError) {
      console.error('Cartridge rule import failed', upsertError);
      throw new Error('The rules could not be imported. Nothing was changed.');
    }
  }

  return { added, updated };
}
