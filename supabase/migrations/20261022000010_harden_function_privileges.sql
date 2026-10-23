-- 0010 · hardening: internal trigger/helper functions are not API endpoints.
-- Supabase grants EXECUTE on public functions to anon and authenticated by default; revoke what the
-- API must not call. Triggers do not need EXECUTE at fire time.

alter function public.set_updated_at() set search_path = public;
alter function public.guard_users_immutable() set search_path = public;
alter function public.guard_session_update() set search_path = public;

revoke execute on function public.assign_user_code()           from public, anon, authenticated;
revoke execute on function public.handle_new_user()            from public, anon, authenticated;
revoke execute on function public.guard_progress_update()      from public, anon, authenticated;
revoke execute on function public.after_progress_withdraw()    from public, anon, authenticated;
revoke execute on function public.after_progress_pass()        from public, anon, authenticated;
revoke execute on function public.guard_exam_update()          from public, anon, authenticated;
revoke execute on function public.sync_progress_from_exam()    from public, anon, authenticated;
revoke execute on function public.guard_error_insert()         from public, anon, authenticated;
revoke execute on function public.notify(uuid, text, jsonb)    from public, anon, authenticated;
revoke execute on function public.grant_role_by_email(text, text) from public, anon, authenticated;

revoke execute on function public.current_profile_id() from anon;
revoke execute on function public.is_admin()           from anon;
revoke execute on function public.is_examiner()        from anon;

revoke execute on function public.nominate_for_exam(uuid)           from anon;
revoke execute on function public.send_session(uuid)                from anon;
revoke execute on function public.respond_to_session(uuid, boolean) from anon;
revoke execute on function public.accept_invite(text)               from anon;
revoke execute on function public.lookup_user_by_code(text)         from anon;
revoke execute on function public.get_lineage_tree(uuid)            from anon;
revoke execute on function public.get_frequent_errors(uuid)         from anon;
revoke execute on function public.auto_assign_teacher()             from anon;
