-- 0011 · RLS helper functions are callable by signed-in users only (policies run as 'authenticated').

revoke execute on function public.current_profile_id() from public, anon;
revoke execute on function public.is_admin()           from public, anon;
revoke execute on function public.is_examiner()        from public, anon;
grant  execute on function public.current_profile_id() to authenticated;
grant  execute on function public.is_admin()           to authenticated;
grant  execute on function public.is_examiner()        to authenticated;
