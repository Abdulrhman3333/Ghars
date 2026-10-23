'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const uuid = z.string().uuid();

/** Nominates a student's juz' for the exam committee (atomic DB function, see migration 0003). */
export async function nominateStudent(formData: FormData): Promise<void> {
  const progressId = uuid.safeParse(formData.get('progressId'));
  if (!progressId.success) redirect('/students?nominate=failed');

  const supabase = await createClient();
  const { error } = await supabase.rpc('nominate_for_exam', { p_progress_id: progressId.data });
  revalidatePath('/students');
  redirect(error ? '/students?nominate=failed' : '/students?nominate=done');
}

/** Resumes a failed juz' (failed → in_progress), so it can be nominated again later. */
export async function resumeJuz(formData: FormData): Promise<void> {
  const progressId = uuid.safeParse(formData.get('progressId'));
  if (!progressId.success) redirect('/students');

  const supabase = await createClient();
  await supabase
    .from('progress')
    .update({ state: 'in_progress' })
    .eq('id', progressId.data)
    .eq('state', 'failed');
  revalidatePath('/students');
  redirect('/students');
}

/** Creates a single-use invite token for the signed-in teacher. */
export async function createInvite(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
  if (!me) redirect('/login');

  const { data, error } = await supabase
    .from('invites')
    .insert({ teacher_id: me.id })
    .select('token')
    .single();
  if (error || !data) redirect('/students?invite=failed');
  redirect(`/students?invite=${data.token}`);
}

/** Redeems an invite: the student is linked to the inviting teacher for their current juz'. */
export async function acceptInvite(formData: FormData): Promise<void> {
  const token = z.string().regex(/^[0-9a-f]{32}$/).safeParse(formData.get('token'));
  if (!token.success) redirect('/home');

  const supabase = await createClient();
  const { error } = await supabase.rpc('accept_invite', { p_token: token.data });
  if (error) redirect(`/invite/${token.data}?error=1`);
  revalidatePath('/teacher');
  redirect('/teacher?joined=1');
}
