'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const uuid = z.string().uuid();
const meetingUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => u.startsWith('https://'), 'https only')
  .or(z.literal(''));

async function fail(path: string, code: string): Promise<never> {
  redirect(`${path}?error=${code}`);
}

/** Claims an unassigned exam in the queue for the signed-in committee member. */
export async function claimExam(formData: FormData): Promise<void> {
  const id = uuid.safeParse(formData.get('examId'));
  if (!id.success) return fail('/committee', 'invalid');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user!.id).single();
  if (!me) return fail('/committee', 'invalid');

  const { error } = await supabase
    .from('exams')
    .update({ examiner_id: me.id })
    .eq('id', id.data)
    .is('examiner_id', null)
    .eq('state', 'nominated');
  if (error) return fail('/committee', 'claim');
  revalidatePath('/committee');
  redirect('/committee?claimed=1');
}

/** Schedules an assigned exam (nominated → scheduled) with a live-video link and time. */
export async function scheduleExam(formData: FormData): Promise<void> {
  const id = uuid.safeParse(formData.get('examId'));
  const when = z.string().datetime().safeParse(formData.get('scheduledIso'));
  const link = meetingUrl.safeParse(formData.get('meetingUrl') ?? '');
  if (!id.success || !when.success || !link.success) return fail('/committee', 'invalid');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user!.id).single();
  if (!me) return fail('/committee', 'invalid');

  const { error } = await supabase
    .from('exams')
    .update({
      examiner_id: me.id,
      state: 'scheduled',
      scheduled_at: when.data,
      meeting_url: link.data || null,
    })
    .eq('id', id.data);
  if (error) return fail('/committee', 'schedule');
  revalidatePath('/committee');
  redirect('/committee?scheduled=1');
}

/** Records the outcome (scheduled → completed). The DB trigger moves progress to passed | failed. */
export async function completeExam(formData: FormData): Promise<void> {
  const id = uuid.safeParse(formData.get('examId'));
  const result = z.enum(['pass', 'fail']).safeParse(formData.get('result'));
  const notes = z.string().max(2000).safeParse(formData.get('notes') ?? '');
  if (!id.success || !result.success || !notes.success) return fail('/committee', 'invalid');

  const supabase = await createClient();
  const { error } = await supabase
    .from('exams')
    .update({
      state: 'completed',
      result: result.data,
      notes: notes.data || null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id.data);
  if (error) return fail('/committee', 'complete');
  revalidatePath('/committee');
  redirect('/committee?completed=1');
}

/** Cancels an exam before completion; progress returns to in_progress via the DB trigger. */
export async function cancelExam(formData: FormData): Promise<void> {
  const id = uuid.safeParse(formData.get('examId'));
  const reason = z.string().trim().min(2).max(300).safeParse(formData.get('reason'));
  if (!id.success || !reason.success) return fail('/committee', 'invalid');

  const supabase = await createClient();
  const { error } = await supabase
    .from('exams')
    .update({ state: 'cancelled', cancelled_reason: reason.data })
    .eq('id', id.data);
  if (error) return fail('/committee', 'cancel');
  revalidatePath('/committee');
  redirect('/committee?cancelled=1');
}
