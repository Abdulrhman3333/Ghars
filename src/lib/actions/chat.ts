'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import { toAsciiDigits } from '@/lib/utils';

const uuid = z.string().uuid();

/** Opens a conversation by the partner's 6-digit code; chat partners are validated in-chat page too. */
export async function startChatByCode(formData: FormData): Promise<void> {
  const code = z
    .string()
    .regex(/^\d{6}$/)
    .safeParse(toAsciiDigits(String(formData.get('code') ?? '')));
  if (!code.success) redirect('/chat?error=notfound');

  const supabase = await createClient();
  const { data: partnerId } = await supabase.rpc('lookup_user_by_code', { p_code: code.data });
  if (!partnerId) redirect('/chat?error=notfound');

  const me = await getCurrentProfile();
  if (partnerId === me.id) redirect('/chat?error=self');

  const { data: allowed } = await supabase.rpc('can_chat_with', { p_user: partnerId });
  if (!allowed) redirect('/chat?error=notallowed');
  redirect(`/chat/${partnerId}`);
}

export async function sendMessage(formData: FormData): Promise<void> {
  const recipientId = uuid.safeParse(formData.get('recipientId'));
  const body = z.string().trim().min(1).max(2000).safeParse(String(formData.get('body') ?? ''));
  if (!recipientId.success || !body.success) return;

  const me = await getCurrentProfile();
  const supabase = await createClient();

  // RLS (chat_insert_linked) only allows sending to the assigned teacher/student
  const { error } = await supabase.from('chat_messages').insert({
    sender_id: me.id,
    recipient_id: recipientId.data,
    body: body.data,
  });
  if (error) redirect(`/chat/${recipientId.data}?error=1`);

  revalidatePath(`/chat/${recipientId.data}`);
}
