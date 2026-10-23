'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { toAsciiDigits } from '@/lib/utils';

const uuid = z.string().uuid();
const juzSchema = z.coerce.number().int().min(1).max(30);
const PDF_MAX_BYTES = 20 * 1024 * 1024;

/** Grants or revokes examiner/admin. Writes are checked by RLS (user_roles admin policies). */
export async function setRole(formData: FormData): Promise<void> {
  const userId = uuid.safeParse(formData.get('userId'));
  const role = z.enum(['examiner', 'admin']).safeParse(formData.get('role'));
  const grant = formData.get('grant') === 'true';
  if (!userId.success || !role.success) redirect('/admin/users?error=invalid');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user!.id).single();

  const { error } = grant
    ? await supabase.from('user_roles').insert({ user_id: userId.data, role: role.data, granted_by: me?.id })
    : await supabase.from('user_roles').delete().eq('user_id', userId.data).eq('role', role.data);
  revalidatePath('/admin/users');
  redirect(error ? '/admin/users?error=role' : '/admin/users?saved=role');
}

/** Manually sets a student's teacher for one juz' (admin). Creates the progress row when missing. */
export async function assignTeacher(formData: FormData): Promise<void> {
  const studentCode = z.string().regex(/^\d{6}$/).safeParse(toAsciiDigits(String(formData.get('studentCode') ?? '')));
  const teacherCode = z.string().regex(/^\d{6}$/).safeParse(toAsciiDigits(String(formData.get('teacherCode') ?? '')));
  const juz = juzSchema.safeParse(formData.get('juz'));
  if (!studentCode.success || !teacherCode.success || !juz.success) {
    redirect('/admin/users?error=invalid');
  }

  const supabase = await createClient();
  const { data: ids } = await supabase
    .from('users')
    .select('id, user_code')
    .in('user_code', [studentCode.data, teacherCode.data]);
  const studentId = ids?.find((u) => u.user_code === studentCode.data)?.id;
  const teacherId = ids?.find((u) => u.user_code === teacherCode.data)?.id;
  if (!studentId || !teacherId || studentId === teacherId) redirect('/admin/users?error=notfound');

  const { error } = await supabase
    .from('progress')
    .upsert(
      { student_id: studentId, juz_number: juz.data, teacher_id: teacherId, state: 'in_progress' },
      { onConflict: 'student_id,juz_number' },
    );
  revalidatePath('/admin/users');
  redirect(error ? '/admin/users?error=assign' : '/admin/users?saved=assign');
}

export async function reviewCommonError(formData: FormData): Promise<void> {
  const id = uuid.safeParse(formData.get('id'));
  const decision = z.enum(['approved', 'rejected']).safeParse(formData.get('decision'));
  if (!id.success || !decision.success) redirect('/admin/common-errors?error=invalid');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user!.id).single();

  await supabase
    .from('common_errors')
    .update({ state: decision.data, reviewed_by: me?.id, reviewed_at: new Date().toISOString() })
    .eq('id', id.data);
  revalidatePath('/admin/common-errors');
  redirect('/admin/common-errors?saved=1');
}

/** Admins can EDIT a submission before approving it (texts, category, notes). */
export async function editCommonError(formData: FormData): Promise<void> {
  const id = uuid.safeParse(formData.get('id'));
  const parsed = z
    .object({
      category_id: z.coerce.number().int().positive(),
      correct_text: z.string().trim().min(1).max(300),
      incorrect_text: z.string().trim().min(1).max(300),
      notes: z.string().trim().max(1000),
    })
    .safeParse({
      category_id: formData.get('category_id'),
      correct_text: formData.get('correct_text'),
      incorrect_text: formData.get('incorrect_text'),
      notes: formData.get('notes') ?? '',
    });
  if (!id.success || !parsed.success) redirect('/admin/common-errors?error=invalid');

  const supabase = await createClient();
  const { error } = await supabase
    .from('common_errors')
    .update({
      category_id: parsed.data.category_id,
      correct_text: parsed.data.correct_text,
      incorrect_text: parsed.data.incorrect_text,
      notes: parsed.data.notes || null,
    })
    .eq('id', id.data);
  revalidatePath('/admin/common-errors');
  redirect(error ? '/admin/common-errors?error=save' : '/admin/common-errors?saved=1');
}

export async function createResourceLink(formData: FormData): Promise<void> {
  const parsed = z
    .object({
      title: z.string().trim().min(2).max(200),
      category: z.string().trim().min(2).max(100),
      url: z.string().trim().url().refine((u) => u.startsWith('https://'), 'https only'),
    })
    .safeParse({
      title: formData.get('title'),
      category: formData.get('category'),
      url: formData.get('url'),
    });
  if (!parsed.success) redirect('/admin/resources?error=invalid');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user!.id).single();

  const { error } = await supabase.from('resources').insert({
    title: parsed.data.title,
    category: parsed.data.category,
    type: 'youtube',
    url: parsed.data.url,
    created_by: me!.id,
  });
  revalidatePath('/admin/resources');
  redirect(error ? '/admin/resources?error=save' : '/admin/resources?saved=1');
}

export async function uploadResourcePdf(formData: FormData): Promise<void> {
  const title = z.string().trim().min(2).max(200).safeParse(formData.get('title'));
  const category = z.string().trim().min(2).max(100).safeParse(formData.get('category'));
  const file = formData.get('file');
  if (!title.success || !category.success || !(file instanceof File) || file.size === 0) {
    redirect('/admin/resources?error=invalid');
  }
  if (file.type !== 'application/pdf' || file.size > PDF_MAX_BYTES) {
    redirect('/admin/resources?error=pdf');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user!.id).single();

  const path = `${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from('pdfs')
    .upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (uploadError) redirect('/admin/resources?error=upload');

  const { error } = await supabase.from('resources').insert({
    title: title.data,
    category: category.data,
    type: 'pdf',
    storage_path: path,
    created_by: me!.id,
  });
  revalidatePath('/admin/resources');
  redirect(error ? '/admin/resources?error=save' : '/admin/resources?saved=1');
}

export async function deleteResource(formData: FormData): Promise<void> {
  const id = uuid.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from('resources').delete().eq('id', id.data);
  revalidatePath('/admin/resources');
}

/** Adds an error sub-type or a common-error category — no code change needed (Phase 0 requirement). */
export async function addSubtype(formData: FormData): Promise<void> {
  const parsed = z
    .object({
      errorTypeId: z.coerce.number().int().positive(),
      code: z.string().trim().regex(/^[a-z_]{2,40}$/),
      nameAr: z.string().trim().min(2).max(100),
    })
    .safeParse({
      errorTypeId: formData.get('errorTypeId'),
      code: formData.get('code'),
      nameAr: formData.get('nameAr'),
    });
  if (!parsed.success) redirect('/admin/taxonomy?error=invalid');

  const supabase = await createClient();
  const { error } = await supabase.from('error_subtypes').insert({
    error_type_id: parsed.data.errorTypeId,
    code: parsed.data.code,
    name_ar: parsed.data.nameAr,
  });
  revalidatePath('/admin/taxonomy');
  redirect(error ? '/admin/taxonomy?error=save' : '/admin/taxonomy?saved=1');
}

export async function addCategory(formData: FormData): Promise<void> {
  const name = z.string().trim().min(2).max(100).safeParse(formData.get('nameAr'));
  if (!name.success) redirect('/admin/taxonomy?error=invalid');

  const supabase = await createClient();
  const { error } = await supabase.from('common_error_categories').insert({ name_ar: name.data });
  revalidatePath('/admin/taxonomy');
  redirect(error ? '/admin/taxonomy?error=save' : '/admin/taxonomy?saved=1');
}
