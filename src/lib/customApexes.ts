import { supabase } from '@/lib/supabase';
import { apexes, type Apex } from '@/data/apexes';
import type { UserCustomApex } from '@/types/database';

const CUSTOM_APEX_PREFIX = 'custom:';

export const customApexTarget = (id: string) => `${CUSTOM_APEX_PREFIX}${id}`;

export const isCustomApexTarget = (slug: string | null | undefined): slug is string =>
  typeof slug === 'string' && slug.startsWith(CUSTOM_APEX_PREFIX);

export const toCustomApexOption = (custom: Pick<UserCustomApex, 'id' | 'title'>): Apex => ({
  slug: customApexTarget(custom.id),
  name: custom.title,
  species: 'Custom Apex',
  epithet: 'Written by you',
  lore: 'A custom Apex built from your own markdown rules. Its voice, habits, and boundaries come entirely from the rules you wrote.',
  available: true,
});

export async function listCustomApexes(): Promise<{ data: UserCustomApex[]; error: string | null }> {
  const { data, error } = await supabase
    .from('user_custom_apexes')
    .select('id, user_id, title, content, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load custom apexes', error);
    return { data: [], error: 'Your custom Apexes could not be loaded.' };
  }
  return { data: (data ?? []) as UserCustomApex[], error: null };
}

export async function resolveApexName(slug: string | null): Promise<string | null> {
  if (!slug) return null;
  if (!isCustomApexTarget(slug)) {
    return apexes.find((a) => a.slug === slug)?.name ?? slug;
  }
  const id = slug.slice(CUSTOM_APEX_PREFIX.length);
  const { data, error } = await supabase
    .from('user_custom_apexes')
    .select('title')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('Failed to resolve custom apex name', error);
    return null;
  }
  return (data as Pick<UserCustomApex, 'title'> | null)?.title ?? null;
}
