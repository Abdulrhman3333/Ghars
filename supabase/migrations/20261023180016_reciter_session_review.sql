-- 0016 · The reciter may review a session's marks as soon as it has left draft
-- (awaiting approval / accepted / rejected) — the /mushaf/session/[id]/review page
-- lets them study the errors and their kinds before/after responding.
-- Previously only 'accepted' sessions were readable by the reciter.

drop policy if exists errors_select on public.mushaf_errors;

create policy errors_select on public.mushaf_errors
  for select to authenticated using (
    (reciter_id = public.current_profile_id()
      and (session_id is null
           or exists (select 1 from public.mushaf_sessions s
                      where s.id = mushaf_errors.session_id and s.state <> 'draft')))
    or exists (select 1 from public.mushaf_sessions s
               where s.id = mushaf_errors.session_id
                 and s.listener_id = public.current_profile_id())
    or public.is_admin()
  );
