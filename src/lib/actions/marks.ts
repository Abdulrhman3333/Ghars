'use server';

import { z } from 'zod';
import ar from '@/messages/ar.json';
import { createClient } from '@/lib/supabase/server';

const planSchema = z.object({
  sessionId: z.string().uuid().nullable(),
  location: z.string().regex(/^\d{1,3}:\d{1,3}:\d{1,3}$/),
  removeIds: z.array(z.string().uuid()).max(20),
  insert: z
    .object({
      typeId: z.number().int().positive(),
      subtypeId: z.number().int().positive().nullable(),
      letterIndex: z.number().int().min(0).max(80).nullable(),
    })
    .nullable(),
});

export type MarkPlan = z.infer<typeof planSchema>;

export type SavedMark = {
  id: string;
  location: string;
  letter_indexes: number[] | null;
  error_type_id: number;
  subtype_id: number | null;
};

export type MarkResult = { error?: string; row?: SavedMark };

/** Applies one user action on one word: removes rows the client selected, then inserts at most one. */
export async function applyMark(input: MarkPlan): Promise<MarkResult> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: ar.mushaf.saveFailed };
  const plan = parsed.data;

  if (plan.location.startsWith('1:1:')) return { error: ar.mushaf.bismillahBlocked };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ar.mushaf.saveFailed };

  const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
  if (!me) return { error: ar.mushaf.saveFailed };

  let reciterId = me.id;
  if (plan.sessionId) {
    const { data: session } = await supabase
      .from('mushaf_sessions')
      .select('reciter_id, state')
      .eq('id', plan.sessionId)
      .single();
    if (!session || session.state !== 'draft') return { error: ar.mushaf.sessionReadonly };
    reciterId = session.reciter_id;
  }

  if (plan.removeIds.length) {
    const { error } = await supabase.from('mushaf_errors').delete().in('id', plan.removeIds);
    if (error) return { error: ar.mushaf.saveFailed };
  }

  if (!plan.insert) return {};

  const { data, error } = await supabase
    .from('mushaf_errors')
    .insert({
      session_id: plan.sessionId,
      reciter_id: reciterId,
      marker_id: me.id,
      location: plan.location,
      letter_indexes: plan.insert.letterIndex === null ? null : [plan.insert.letterIndex],
      error_type_id: plan.insert.typeId,
      subtype_id: plan.insert.subtypeId,
    })
    .select('id, location, letter_indexes, error_type_id, subtype_id')
    .single();

  if (error || !data) return { error: ar.mushaf.saveFailed };
  return { row: data as SavedMark };
}
