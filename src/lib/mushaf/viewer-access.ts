import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** True when `viewerId` has an ACCEPTED entry on `ownerId`'s viewer list (read-only access). */
export async function isAcceptedViewer(
  supabase: SupabaseClient,
  ownerId: string,
  viewerId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('viewer_list')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('viewer_id', viewerId)
    .eq('state', 'accepted')
    .maybeSingle();
  return !!data;
}
