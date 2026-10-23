'use server';

import { revalidatePath } from 'next/cache';
import ar from '@/messages/ar.json';
import { createClient } from '@/lib/supabase/server';
import { profileSchema, userCodeSchema } from '@/lib/validation/auth';
import type { ActionState } from '@/types';

function field(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse({
    name: field(formData, 'name'),
    phone: field(formData, 'phone'),
    preferred_contact: field(formData, 'preferred_contact'),
    age_range: field(formData, 'age_range'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? ar.common.unexpected };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ar.common.unexpected };

  const { error } = await supabase
    .from('users')
    .update({
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      preferred_contact: parsed.data.preferred_contact,
      age_range: parsed.data.age_range,
    })
    .eq('auth_user_id', user.id);

  if (error) return { error: ar.common.unexpected };

  revalidatePath('/profile');
  return { success: ar.profile.saved };
}

export async function addAutoAccept(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  const { data: listenerId, error: lookupError } = await supabase.rpc('lookup_user_by_code', {
    p_code: parsed.data,
  });
  if (lookupError) return { error: ar.common.unexpected };
  if (!listenerId) return { error: ar.profile.autoAccept.notFound };
  if (listenerId === me.id) return { error: ar.profile.autoAccept.selfError };

  const { error } = await supabase
    .from('auto_accept_list')
    .insert({ reciter_id: me.id, listener_id: listenerId });

  // 23505 = already in the list: treat as success
  if (error && error.code !== '23505') return { error: ar.common.unexpected };

  revalidatePath('/profile');
  return { success: ar.profile.autoAccept.added };
}

export async function removeAutoAccept(listenerId: string): Promise<void> {
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
    .from('auto_accept_list')
    .delete()
    .eq('reciter_id', me.id)
    .eq('listener_id', listenerId);

  revalidatePath('/profile');
}
