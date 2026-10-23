-- 0009 · automatic teacher assignment (Phase 0 assumption A1):
-- the least-loaded teacher certified for the student's current juz' is assigned.
-- Age-range matching is deliberately NOT implemented (schema-ready only).

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

  perform public.notify(v_teacher, 'student_assigned',
    jsonb_build_object('student_id', v_me, 'juz_number', v_juz));
  perform public.notify(v_me, 'teacher_assigned',
    jsonb_build_object('teacher_id', v_teacher, 'juz_number', v_juz));
  return v_teacher;
end;
$$;

revoke execute on function public.auto_assign_teacher() from public;
grant execute on function public.auto_assign_teacher() to authenticated;
