-- 0017 · Viewer list: a user may invite other accounts (e.g. a parent) to READ-ONLY
-- view his marked mistakes and his sent sessions.
--   owner  = the reciter whose mistakes/sessions are visible
--   viewer = the invited account (must already exist; addressed by user_code)
-- The invite flow mirrors sessions: owner adds by user_code → row is 'pending'
-- → the viewer accepts it via accept_viewer_invite(uuid). No UPDATE policy: every
-- state change goes through the security-definer function.
-- Draft sessions stay invisible; email/phone stay private — only user_code edges widen.

create table public.viewer_list (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  viewer_id    uuid not null references public.users(id) on delete cascade,
  state        text not null default 'pending'
               check (state in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);

alter table public.viewer_list enable row level security;

-- the owner manages his list; the viewer sees (and may leave) his invitations;
-- everyone else sees nothing
create policy viewer_select on public.viewer_list
  for select to authenticated using (
    owner_id = public.current_profile_id()
    or viewer_id = public.current_profile_id()
    or public.is_admin()
  );

create policy viewer_insert on public.viewer_list
  for insert to authenticated with check (
    owner_id = public.current_profile_id() and viewer_id <> owner_id
  );

create policy viewer_delete on public.viewer_list
  for delete to authenticated using (
    owner_id = public.current_profile_id()
    or viewer_id = public.current_profile_id()
  );

-- acceptance is the only transition and it is viewer-gated
create or replace function public.accept_viewer_invite(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.viewer_list%rowtype;
begin
  if public.current_profile_id() is null then raise exception 'not authenticated'; end if;
  select * into v_row from public.viewer_list where id = p_id for update;
  if not found then raise exception 'invite not found'; end if;
  if v_row.viewer_id <> public.current_profile_id() then raise exception 'not your invite'; end if;
  if v_row.state <> 'pending' then return; end if; -- idempotent
  update public.viewer_list set state = 'accepted', responded_at = now() where id = p_id;
  perform public.notify(v_row.owner_id, 'viewer_added',
    jsonb_build_object('viewer_id', public.current_profile_id()));
end;
$$;

revoke execute on function public.accept_viewer_invite(uuid) from public, anon;
grant execute on function public.accept_viewer_invite(uuid) to authenticated;

-- 1/3 · owner ⇆ viewer may see each other's basic profile (user_code only)
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
    or exists (select 1 from public.viewer_list v
            where (v.owner_id = public.current_profile_id() and v.viewer_id = users.id)
               or (v.viewer_id = public.current_profile_id() and v.owner_id = users.id))
  );

-- 2/3 · an accepted viewer sees the owner's sent sessions (reciter side only, never drafts)
drop policy sessions_select on public.mushaf_sessions;
create policy sessions_select on public.mushaf_sessions
  for select to authenticated using (
    (reciter_id = public.current_profile_id() and state <> 'draft')
    or listener_id = public.current_profile_id()
    or public.is_admin()
    or (state <> 'draft' and exists (
          select 1 from public.viewer_list v
          where v.viewer_id = public.current_profile_id() and v.state = 'accepted'
            and v.owner_id = mushaf_sessions.reciter_id))
  );

-- 3/3 · an accepted viewer reads the owner's marks: his self-marks and the marks of
-- the owner's sent (non-draft) sessions as reciter. Marks of sessions where the
-- owner was only the listener are NOT exposed (their reciter_id is someone else).
drop policy errors_select on public.mushaf_errors;
create policy errors_select on public.mushaf_errors
  for select to authenticated using (
    (reciter_id = public.current_profile_id()
      and (session_id is null
           or exists (select 1 from public.mushaf_sessions s
                      where s.id = mushaf_errors.session_id and s.state <> 'draft')))
    or exists (select 1 from public.mushaf_sessions s
               where s.id = mushaf_errors.session_id
                 and s.listener_id = public.current_profile_id())
    or (exists (select 1 from public.viewer_list v
                where v.viewer_id = public.current_profile_id() and v.state = 'accepted'
                  and v.owner_id = mushaf_errors.reciter_id)
        and (mushaf_errors.session_id is null
             or exists (select 1 from public.mushaf_sessions s
                        where s.id = mushaf_errors.session_id and s.state <> 'draft')))
    or public.is_admin()
  );
