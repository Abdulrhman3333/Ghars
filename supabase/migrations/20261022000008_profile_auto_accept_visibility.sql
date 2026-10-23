-- 0008 · auto-accept partners may see each other's basic profile (name + user_code shown on /profile).
-- Email/phone remain governed by the same rule: this only widens the visibility of users who are
-- already linked through an explicit auto-accept relationship.

drop policy users_select_related on public.users;

create policy users_select_related on public.users
  for select to authenticated using (
    exists (select 1 from public.progress p
            where (p.student_id = public.current_profile_id() and p.teacher_id = users.id)
               or (p.teacher_id = public.current_profile_id() and p.student_id = users.id))
    or exists (select 1 from public.mushaf_sessions s
            where s.state <> 'draft'
              and ((s.reciter_id = public.current_profile_id() and s.listener_id = users.id)
                or (s.listener_id = public.current_profile_id() and s.reciter_id = users.id)))
    or exists (select 1 from public.exams e
            where e.examiner_id = public.current_profile_id() and e.student_id = users.id)
    or exists (select 1 from public.auto_accept_list a
            where (a.reciter_id = public.current_profile_id() and a.listener_id = users.id)
               or (a.listener_id = public.current_profile_id() and a.reciter_id = users.id))
  );
