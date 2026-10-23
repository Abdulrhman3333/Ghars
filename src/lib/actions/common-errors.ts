'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/ogg', 'audio/webm'];
const AUDIO_MAX_BYTES = 10 * 1024 * 1024;

const schema = z.object({
  category_id: z.coerce.number().int().positive(),
  correct_text: z.string().trim().min(1).max(300),
  incorrect_text: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(1000),
});

function audioFile(v: FormDataEntryValue | null): File | null {
  return v instanceof File && v.size > 0 ? v : null;
}

function extensionOf(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext && /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'audio';
}

/**
 * Submits a common error for review. Audio goes to <auth uid>/… in the private 'audio' bucket;
 * the storage policy (migration 0006) and bucket limits (migration 0005) are enforced again here.
 */
export async function submitCommonError(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    category_id: formData.get('category_id'),
    correct_text: formData.get('correct_text'),
    incorrect_text: formData.get('incorrect_text'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) redirect('/common-errors?error=invalid');

  const correct = audioFile(formData.get('correct_audio'));
  const incorrect = audioFile(formData.get('incorrect_audio'));
  for (const f of [correct, incorrect]) {
    if (f && (!AUDIO_TYPES.includes(f.type) || f.size > AUDIO_MAX_BYTES)) {
      redirect('/common-errors?error=audio');
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
  if (!me) redirect('/login');

  const upload = async (file: File | null) => {
    if (!file) return null;
    const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${extensionOf(file)}`;
    const { error } = await supabase.storage.from('audio').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    return error ? undefined : path;
  };

  const correctPath = await upload(correct);
  const incorrectPath = await upload(incorrect);
  if (correctPath === undefined || incorrectPath === undefined) {
    redirect('/common-errors?error=upload');
  }

  const { error } = await supabase.from('common_errors').insert({
    category_id: parsed.data.category_id,
    correct_text: parsed.data.correct_text,
    incorrect_text: parsed.data.incorrect_text,
    notes: parsed.data.notes || null,
    correct_audio_path: correctPath,
    incorrect_audio_path: incorrectPath,
    submitted_by: me.id,
  });
  if (error) redirect('/common-errors?error=save');

  revalidatePath('/common-errors');
  redirect('/common-errors?submitted=1');
}
