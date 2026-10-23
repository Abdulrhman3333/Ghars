'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import ar from '@/messages/ar.json';
import { createClient } from '@/lib/supabase/server';
import { userCodeSchema } from '@/lib/validation/auth';
import type { ActionState } from '@/types';

/** Starts a draft session for a reciter addressed by public code, then opens the marking view. */
export async function createSession(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = userCodeSchema.safeParse(formData.get('code') ?? '');
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? ar.common.unexpected };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ar.common.unexpected };

  const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
  if (!me) return { error: ar.common.unexpected };

  const { data: reciterId, error: lookupError } = await supabase.rpc('lookup_user_by_code', {
    p_code: parsed.data,
  });
  if (lookupError) return { error: ar.common.unexpected };
  if (!reciterId) return { error: ar.sessions.notFound };
  if (reciterId === me.id) return { error: ar.sessions.selfError };

  const { data: session, error } = await supabase
    .from('mushaf_sessions')
    .insert({ reciter_id: reciterId, listener_id: me.id })
    .select('id')
    .single();
  if (error || !session) return { error: ar.common.unexpected };

  redirect(`/mushaf/session/${session.id}/1`);
}

/** Sends a draft session to its reciter (or auto-accepts it when the reciter trusts the listener). */
export async function sendSession(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.string().uuid().safeParse(formData.get('sessionId'));
  if (!parsed.success) return { error: ar.common.unexpected };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('send_session', { p_session_id: parsed.data });
  if (error) {
    return { error: /no marks/i.test(error.message) ? ar.sessions.emptySession : ar.common.unexpected };
  }

  revalidatePath('/sessions');
  redirect(data === 'accepted' ? '/sessions?sent=accepted' : '/sessions?sent=pending');
}

export async function respondToSession(formData: FormData): Promise<void> {
  const id = z.string().uuid().safeParse(formData.get('sessionId'));
  if (!id.success) return;
  const accept = formData.get('accept') === 'true';

  const supabase = await createClient();
  await supabase.rpc('respond_to_session', { p_session_id: id.data, p_accept: accept });
  revalidatePath('/sessions');
}
