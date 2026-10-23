-- 0007 · derived data: teacher eligibility, lineage, repeat counting, statistics.
-- Views use security_invoker so the CALLER's RLS applies (no data leakage through views).

-- who may teach which juz (derived — never a stored role)
create or replace view public.v_teacher_eligibility
with (security_invoker = on) as
select student_id as user_id, juz_number
from public.progress
where state = 'passed';

-- lineage edges: nominating teacher → student, per juz, for PASSED attempts only
create or replace view public.v_lineage_edges
with (security_invoker = on) as
select nominated_by as certifier_id,
       student_id   as certified_id,
       juz_number,
       completed_at as certified_at
from public.exams
where state = 'completed' and result = 'pass';

-- repeat counter: same word + same error type across DISTINCT accepted sessions
create or replace view public.v_error_repeat_counts
with (security_invoker = on) as
select e.reciter_id,
       e.location,
       e.error_type_id,
       count(distinct e.session_id) as repeat_count
from public.mushaf_errors e
join public.mushaf_sessions s on s.id = e.session_id
where s.state = 'accepted'
group by e.reciter_id, e.location, e.error_type_id;

-- interactive lineage tree: full downstream of a user (own tree, or admin)
create or replace function public.get_lineage_tree(p_root uuid default null)
returns table (
  user_id      uuid,
  name         text,
  user_code    text,
  certifier_id uuid,
  juz_number   smallint,
  depth        integer,
  certified_at timestamptz
)
language plpgsql security definer set search_path = public as
$$
declare
  v_root uuid := coalesce(p_root, public.current_profile_id());
begin
  if v_root is distinct from public.current_profile_id() and not public.is_admin() then
    raise exception 'you can only view your own lineage tree';
  end if;
  return query
  with recursive tree as (
    select e.student_id as user_id, e.nominated_by as certifier_id,
           e.juz_number, 1 as depth, e.completed_at
    from public.exams e
    where e.state = 'completed' and e.result = 'pass' and e.nominated_by = v_root
    union all
    select e.student_id, e.nominated_by, e.juz_number, t.depth + 1, e.completed_at
    from public.exams e
    join tree t on e.nominated_by = t.user_id and e.juz_number = t.juz_number
    where e.state = 'completed' and e.result = 'pass' and t.depth < 50
  )
  select t.user_id, u.name, u.user_code, t.certifier_id, t.juz_number, t.depth, t.completed_at
  from tree t
  join public.users u on u.id = t.user_id
  order by t.depth, t.completed_at;
end;
$$;

-- personal most-frequent errors (self-marks + accepted session marks), for the stats page
create or replace function public.get_frequent_errors(p_user uuid default null)
returns table (
  error_type_id smallint,
  subtype_id    smallint,
  total         bigint
)
language plpgsql security definer set search_path = public as
$$
declare
  v_target uuid := coalesce(p_user, public.current_profile_id());
begin
  if v_target is distinct from public.current_profile_id() and not public.is_admin() then
    raise exception 'you can only view your own error statistics';
  end if;
  return query
  select e.error_type_id, e.subtype_id, count(*)::bigint
  from public.mushaf_errors e
  left join public.mushaf_sessions s on s.id = e.session_id
  where e.reciter_id = v_target
    and (e.session_id is null or s.state = 'accepted')
  group by e.error_type_id, e.subtype_id
  order by count(*) desc;
end;
$$;

-- ============ hardening: security-definer API functions are for authenticated users only ============
-- (default EXECUTE grant to PUBLIC would include the anon role)
revoke execute on function public.nominate_for_exam(uuid)          from public;
revoke execute on function public.send_session(uuid)               from public;
revoke execute on function public.respond_to_session(uuid, boolean) from public;
revoke execute on function public.accept_invite(text)              from public;
revoke execute on function public.lookup_user_by_code(text)        from public;
revoke execute on function public.get_lineage_tree(uuid)           from public;
revoke execute on function public.get_frequent_errors(uuid)        from public;
revoke execute on function public.grant_role_by_email(text, text)  from public;
revoke execute on function public.notify(uuid, text, jsonb)        from public;

grant execute on function public.nominate_for_exam(uuid)            to authenticated;
grant execute on function public.send_session(uuid)                 to authenticated;
grant execute on function public.respond_to_session(uuid, boolean)  to authenticated;
grant execute on function public.accept_invite(text)                to authenticated;
grant execute on function public.lookup_user_by_code(text)          to authenticated;
grant execute on function public.get_lineage_tree(uuid)             to authenticated;
grant execute on function public.get_frequent_errors(uuid)          to authenticated;
-- grant_role_by_email and notify stay internal (postgres / service role only)
