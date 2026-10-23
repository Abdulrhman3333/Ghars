-- 0012 · two fixes found by the database tests.
-- 1. The cascade flag ghars.cascade was set transaction-locally and never cleared, so later state changes
--    in the same transaction were misclassified as system cascades. Each cascade now clears its flag.
-- 2. Reciters could see listener draft sessions (metadata leak). Drafts are visible to the listener only.

drop policy sessions_select on public.mushaf_sessions;
create policy sessions_select on public.mushaf_sessions
  for select to authenticated using (
    (reciter_id = public.current_profile_id() and state <> 'draft')
    or listener_id = public.current_profile_id()
    or public.is_admin()
  );

create or replace function public.sync_progress_from_exam() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  if new.state is not distinct from old.state then
    return new;
  end if;
  perform set_config('ghars.cascade', 'on', true);

  if new.state = 'scheduled' and old.state = 'nominated' then
    update public.progress set state = 'exam_scheduled' where id = new.progress_id;
    perform public.notify(new.student_id, 'exam_scheduled',
      jsonb_build_object('juz_number', new.juz_number, 'scheduled_at', new.scheduled_at));
  elsif new.state = 'completed' and old.state = 'scheduled' then
    update public.progress
    set state = case when new.result = 'pass' then 'passed' else 'failed' end
    where id = new.progress_id;
    perform public.notify(new.student_id, 'exam_result',
      jsonb_build_object('juz_number', new.juz_number, 'result', new.result));
  elsif new.state = 'cancelled' and old.state in ('nominated','scheduled') then
    update public.progress set state = 'in_progress'
    where id = new.progress_id and state in ('nominated','exam_scheduled');
  end if;

  perform set_config('ghars.cascade', 'off', true);
  return new;
end;
$$;

create or replace function public.after_progress_withdraw() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  if old.state = 'nominated' and new.state = 'in_progress'
     and current_setting('ghars.cascade', true) is distinct from 'on' then
    perform set_config('ghars.cascade', 'on', true);
    update public.exams
    set state = 'cancelled', cancelled_reason = 'nomination_withdrawn'
    where progress_id = new.id and state = 'nominated';
    perform set_config('ghars.cascade', 'off', true);
  end if;
  return new;
end;
$$;

create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as
$$
declare
  i     public.invites%rowtype;
  v_me  uuid := public.current_profile_id();
  v_juz smallint;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  select * into i from public.invites where token = p_token for update;
  if not found or i.used_by is not null or i.expires_at <= now() then
    raise exception 'invite is invalid or expired';
  end if;
  if i.teacher_id = v_me then
    raise exception 'you cannot use your own invite';
  end if;

  update public.invites set used_by = v_me, used_at = now() where id = i.id;

  select min(j) into v_juz
  from generate_series(1, 30) as j
  where not exists (
    select 1 from public.progress pr
    where pr.student_id = v_me and pr.juz_number = j and pr.state = 'passed'
  );

  perform set_config('ghars.cascade', 'on', true);
  insert into public.progress (student_id, teacher_id, juz_number, state)
  values (v_me, i.teacher_id, v_juz, 'in_progress')
  on conflict (student_id, juz_number) do update
    set teacher_id = excluded.teacher_id;
  perform set_config('ghars.cascade', 'off', true);

  perform public.notify(i.teacher_id, 'invite_accepted',
    jsonb_build_object('student_id', v_me, 'juz_number', v_juz));
  return i.teacher_id;
end;
$$;

create or replace function public.auto_assign_teacher() returns uuid
language plpgsql security definer set search_path = public as
$$
declare
  v_me      uuid := public.current_profile_id();
  v_juz     smallint;
  v_current public.progress%rowtype;
  v_teacher uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select min(j) into v_juz
  from generate_series(1, 30) as j
  where not exists (
    select 1 from public.progress pr
    where pr.student_id = v_me and pr.juz_number = j and pr.state = 'passed'
  );
  if v_juz is null then
    return null;
  end if;

  select * into v_current from public.progress where student_id = v_me and juz_number = v_juz;
  if found and v_current.teacher_id is not null then
    return v_current.teacher_id;
  end if;

  select e.user_id into v_teacher
  from public.v_teacher_eligibility e
  where e.juz_number = v_juz and e.user_id <> v_me
  order by (
      select count(*) from public.progress p
      where p.teacher_id = e.user_id and p.state in ('in_progress','nominated','exam_scheduled')
    ), random()
  limit 1;
  if v_teacher is null then
    return null;
  end if;

  perform set_config('ghars.cascade', 'on', true);
  insert into public.progress (student_id, teacher_id, juz_number, state)
  values (v_me, v_teacher, v_juz, 'in_progress')
  on conflict (student_id, juz_number) do update set teacher_id = excluded.teacher_id;
  perform set_config('ghars.cascade', 'off', true);

  perform public.notify(v_teacher, 'student_assigned',
    jsonb_build_object('student_id', v_me, 'juz_number', v_juz));
  perform public.notify(v_me, 'teacher_assigned',
    jsonb_build_object('teacher_id', v_teacher, 'juz_number', v_juz));
  return v_teacher;
end;
$$;
