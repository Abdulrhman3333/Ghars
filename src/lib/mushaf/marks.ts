import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { MarkRow } from '@/components/mushaf/mushaf-view';

type Scope =
  | { kind: 'self' | 'of'; userId: string }
  | { kind: 'session'; sessionId: string; editable: boolean };

/**
 * scope kinds:
 * - 'self'  — my own marks (Mushaf personal view)
 * - 'of'    — another user's marks, read-only (viewer list access; RLS gates visibility)
 * - 'session' — the marks of one session (listener/reciter/viewer session view)
 * RLS decides visibility; these filters only narrow the result to the current page.
 */
export async function loadMarks(scope: Scope, locations: string[]): Promise<MarkRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from('mushaf_errors')
    .select('id, location, letter_indexes, error_type_id, subtype_id, session_id')
    .in('location', locations);

  query = scope.kind === 'session'
    ? query.eq('session_id', scope.sessionId)
    : query.eq('reciter_id', scope.userId);

  const { data, error } = await query;
  if (error || !data) return [];

  const rows: MarkRow[] = [];
  for (const r of data) {
    const readonly = scope.kind === 'session' ? !scope.editable : r.session_id !== null;
    const indexes = r.letter_indexes?.length ? r.letter_indexes : [null];
    for (const idx of indexes) {
      rows.push({
        id: r.id,
        location: r.location,
        letterIndex: idx,
        typeId: r.error_type_id,
        subtypeId: r.subtype_id,
        readonly,
      });
    }
  }
  return rows;
}
