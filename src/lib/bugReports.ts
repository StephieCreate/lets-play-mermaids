import { supabase } from '@/lib/supabase';
import { resolveApexName } from '@/lib/customApexes';
import type { Playthrough } from '@/types/database';

interface SubmitBugReportInput {
  userId: string | null;
  playthroughId: string | null;
  description: string;
}

export async function submitBugReport({
  userId,
  playthroughId,
  description,
}: SubmitBugReportInput): Promise<string | null> {
  let activeApex: string | null = null;

  if (playthroughId) {
    const { data, error } = await supabase
      .from('playthroughs')
      .select('apex_target')
      .eq('id', playthroughId)
      .maybeSingle();

    if (error || !data) {
      console.error('Failed to read active playthrough for bug report', error);
      return 'We could not read your current playthrough. Please try again.';
    }

    const apexSlug = (data as Pick<Playthrough, 'apex_target'>).apex_target;
    activeApex = await resolveApexName(apexSlug);
  }

  const { error } = await supabase.from('bug_reports').insert({
    user_id: userId,
    playthrough_id: playthroughId,
    active_apex: activeApex,
    description: description.trim(),
    browser_info: navigator.userAgent.slice(0, 1000),
  });

  if (error) {
    console.error('Failed to submit bug report', error);
    return 'Your report could not be sent. Please try again.';
  }

  return null;
}
