import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Throws 404 unless the signed-in user holds the admin role (RLS also enforces every admin write). */
export async function requireAdmin(): Promise<{ id: string; user_code: string }> {
  const me = await getCurrentProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', me.id)
    .eq('role', 'admin')
    .maybeSingle();
  if (!data) notFound();
  return me;
}

/**
 * The signed-in user's profile id and public code. Names are private (self + admin only,
 * migration 0013) — pages address other users by `user_code`. Redirects to /login otherwise.
 */
export async function getCurrentProfile(): Promise<{ id: string; user_code: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('users')
    .select('id, user_code')
    .eq('auth_user_id', user.id)
    .single();
  if (!data) redirect('/login');
  return data;
}
