'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import ar from '@/messages/ar.json';
import { createClient } from '@/lib/supabase/server';
import { userCodeSchema } from '@/lib/validation/auth';
import type { ActionState } from '@/types';

function field(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

/** Owner invites an account (by user_code) to read-only view his mistakes and sessions. */
export async function addViewer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = userCodeSchema.safeParse(field(formData, 'code'));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? ar.common.unexpected };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ar.common.unexpected };

  const { data: me } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();
  if (!me) return { error: ar.common.unexpected };

  const { data: viewerId, error: lookupError } = await supabase.rpc('lookup_user_by_code', {
    p_code: parsed.data,
  });
  if (lookupError) return { error: ar.common.unexpected };
  if (!viewerId) return { error: ar.profile.viewers.notFound };
  if (viewerId === me.id) return { error: ar.profile.viewers.selfError };

  const { error } = await supabase
    .from('viewer_list')
    .insert({ owner_id: me.id, viewer_id: viewerId });

  // 23505 = already invited: treat as success
  if (error && error.code !== '23505') return { error: ar.common.unexpected };

  revalidatePath('/profile');
  return { success: ar.profile.viewers.added };
}

/** Owner removes a viewer, or the viewer declines/leaves — RLS allows either side. */
export async function removeViewer(formData: FormData): Promise<void> {
  const parsed = z.string().uuid().safeParse(field(formData, 'id'));
  if (!parsed.success) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: me } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();
  if (!me) return;

  await supabase
    .from('viewer_list')
    .delete()
    .eq('id', parsed.data)
    .or(`owner_id.eq.${me.id},viewer_id.eq.${me.id}`);

  revalidatePath('/profile');
}

/** Viewer accepts a pending invitation (security-definer RPC). */
export async function acceptViewerInvite(formData: FormData): Promise<void> {
  const parsed = z.string().uuid().safeParse(field(formData, 'id'));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.rpc('accept_viewer_invite', { p_id: parsed.data });

  revalidatePath('/profile');
}
