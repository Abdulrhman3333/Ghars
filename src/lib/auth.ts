import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Throws 404 unless the signed-in user holds the admin role (RLS also enforces every admin write). */
export async function requireAdmin(): Promise<{ id: string; name: string }> {
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

/** The signed-in user's profile id and name; redirects to /login when there is none. */
export async function getCurrentProfile(): Promise<{ id: string; name: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('users')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .single();
  if (!data) redirect('/login');
  return data;
}
