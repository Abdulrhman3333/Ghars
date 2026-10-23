'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/ogg', 'audio/webm'];
const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const schema = z.object({
  category_id: z.coerce.number().int().positive(),
  correct_text: z.string().trim().min(1).max(300),
  incorrect_text: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(1000),
});

function uploadedFile(v: FormDataEntryValue | null): File | null {
  return v instanceof File && v.size > 0 && v.name !== '' ? v : null;
}

function extensionOf(file: File, fallback: string) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext && /^[a-z0-9]{1,5}$/.test(ext) ? ext : fallback;
}

/**
 * Submits a common error for review. Audio goes to <auth uid>/… in the private 'audio' bucket and
 * images to <auth uid>/… in 'error-images'; the storage policies (migration 0006/0013) and bucket
 * limits are enforced again here.
 */
export async function submitCommonError(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    category_id: formData.get('category_id'),
    correct_text: formData.get('correct_text'),
    incorrect_text: formData.get('incorrect_text'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) redirect('/common-errors?error=invalid');

  const correct = uploadedFile(formData.get('correct_audio'));
  const incorrect = uploadedFile(formData.get('incorrect_audio'));
  for (const f of [correct, incorrect]) {
    if (f && (!AUDIO_TYPES.includes(f.type) || f.size > AUDIO_MAX_BYTES)) {
      redirect('/common-errors?error=audio');
    }
  }

  const correctImg = uploadedFile(formData.get('correct_image'));
  const incorrectImg = uploadedFile(formData.get('incorrect_image'));
  for (const f of [correctImg, incorrectImg]) {
    if (f && (!IMAGE_TYPES.includes(f.type) || f.size > IMAGE_MAX_BYTES)) {
      redirect('/common-errors?error=image');
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
  if (!me) redirect('/login');

  const uploadAudio = async (file: File | null) => {
    if (!file) return null;
    const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${extensionOf(file, 'audio')}`;
    const { error } = await supabase.storage.from('audio').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    return error ? undefined : path;
  };

  const uploadImage = async (file: File | null) => {
    if (!file) return null;
    const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${extensionOf(file, 'png')}`;
    const { error } = await supabase.storage.from('error-images').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    return error ? undefined : path;
  };

  const [correctPath, incorrectPath, correctImagePath, incorrectImagePath] = await Promise.all([
    uploadAudio(correct),
    uploadAudio(incorrect),
    uploadImage(correctImg),
    uploadImage(incorrectImg),
  ]);
  if (correctPath === undefined || incorrectPath === undefined
      || correctImagePath === undefined || incorrectImagePath === undefined) {
    redirect('/common-errors?error=upload');
  }

  const { error } = await supabase.from('common_errors').insert({
    category_id: parsed.data.category_id,
    correct_text: parsed.data.correct_text,
    incorrect_text: parsed.data.incorrect_text,
    notes: parsed.data.notes || null,
    correct_audio_path: correctPath,
    incorrect_audio_path: incorrectPath,
    correct_image_path: correctImagePath,
    incorrect_image_path: incorrectImagePath,
    submitted_by: me.id,
  });
  if (error) redirect('/common-errors?error=save');

  revalidatePath('/common-errors');
  redirect('/common-errors?submitted=1');
}
