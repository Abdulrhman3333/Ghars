'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import ar from '@/messages/ar.json';
import { createClient } from '@/lib/supabase/server';
import { forgotSchema, loginSchema, registerSchema, resetSchema } from '@/lib/validation/auth';
import type { ActionState } from '@/types';

async function originFromRequest() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

function field(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

export async function register(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    email: field(formData, 'email'),
    age_range: field(formData, 'age_range'),
    password: field(formData, 'password'),
    confirmPassword: field(formData, 'confirmPassword'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? ar.common.unexpected };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const origin = await originFromRequest();
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=/home`,
      data: {
        age_range: v.age_range,
      },
    },
  });

  if (error) {
    const alreadyRegistered = /already|registered/i.test(error.message);
    return { error: alreadyRegistered ? ar.auth.emailExists : ar.auth.genericError };
  }

  // The normal signup response includes a session. If the project still requires
  // email confirmation, try signing in once more so local and hosted settings
  // behave consistently.
  if (!data.session) {
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: v.email,
      password: v.password,
    });
    if (loginError) {
      console.error('Registration created an account but automatic sign-in failed', loginError);
      return { error: ar.auth.genericError };
    }
  }

  redirect('/home');
}

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: field(formData, 'email'),
    password: field(formData, 'password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? ar.common.unexpected };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: ar.auth.invalidCredentials };
  }
  redirect('/home');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotSchema.safeParse({ email: field(formData, 'email') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? ar.common.unexpected };
  }

  const supabase = await createClient();
  const origin = await originFromRequest();
  // same message whether or not the address exists (no account enumeration)
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });
  return { success: ar.auth.forgotSent };
}

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetSchema.safeParse({
    password: field(formData, 'password'),
    confirmPassword: field(formData, 'confirmPassword'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? ar.common.unexpected };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: ar.auth.linkInvalid };
  }
  redirect('/home');
}
