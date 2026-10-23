-- Database logic tests (state machines, RLS privacy, sessions, repeat counting, invites, hardening).
-- Everything runs in one transaction that is rolled back, so no test data is kept.
-- Run locally against a Supabase instance:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/database.test.sql
-- A failing check raises "FAILED: <label>" and stops the run.

begin;

create temp table fx (k text primary key, id uuid not null);
grant select on fx to public;

-- fixture user: auth row (the handle_new_user trigger creates the profile)
create or replace function pg_temp.mkuser(p_name text) returns uuid
language plpgsql as $$
declare
  v_auth    uuid := gen_random_uuid();
  v_profile uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token, is_sso_user, is_anonymous
  ) values (
    v_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'fx_' || replace(v_auth::text, '-', '') || '@test.local', '', now(),
    jsonb_build_object('name', p_name, 'age_range', '25_34', 'preferred_contact', 'whatsapp'),
    '{}'::jsonb, now(), now(), '', '', '', '', '', '', false, false
  );
  select id into v_profile from public.users where auth_user_id = v_auth;
  return v_profile;
end $$;

create or replace function pg_temp.f(p_key text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  select id into v from fx where k = p_key;
  if v is null then raise exception 'no fixture %', p_key; end if;
  return v;
end $$;

-- reads the auth id bypassing RLS (runs as the function owner)
create or replace function pg_temp.auth_of(p_key text) returns uuid
language plpgsql security definer as $$
declare v uuid;
begin
  select u.auth_user_id into v from public.users u where u.id = pg_temp.f(p_key);
  return v;
end $$;

create or replace function pg_temp.as_postgres() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'reset role';
end $$;

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;

-- impersonate a fixture user the way PostgREST does: JWT claims + authenticated role
create or replace function pg_temp.act(p_key text) returns void
language plpgsql as $$
declare v_auth uuid := pg_temp.auth_of(p_key);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
  execute 'set local role authenticated';
end $$;

-- the statement must fail; if it succeeds the check fails
create or replace function pg_temp.expect_fail(p_sql text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok (rejected as expected): %', p_label;
    return;
  end;
  raise exception 'FAILED: expected an error but none was raised: %', p_label;
end $$;

create or replace function pg_temp.ok_if(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAILED: %', p_label;
  end if;
  raise notice 'ok: %', p_label;
end $$;

-- ============ fixtures ============
do $$
begin
  perform pg_temp.as_postgres();
  insert into fx values
    ('S',  pg_temp.mkuser('طالب')),
    ('T',  pg_temp.mkuser('معلم')),
    ('E',  pg_temp.mkuser('لجنة')),
    ('A',  pg_temp.mkuser('مدير')),
    ('X',  pg_temp.mkuser('غريب')),
    ('S2', pg_temp.mkuser('طالب ٢')),
    ('S3', pg_temp.mkuser('طالب ٣')),
    ('T2', pg_temp.mkuser('معلم ٢')),
    ('L',  pg_temp.mkuser('مستمع')),
    ('R',  pg_temp.mkuser('قارئ')),
    ('S4', pg_temp.mkuser('مدعو')),
    ('S5', pg_temp.mkuser('جديد'));

  insert into public.user_roles (user_id, role) values
    (pg_temp.f('E'), 'examiner'),
    (pg_temp.f('A'), 'admin');

  -- T is certified for juz 1; T2 is not
  insert into public.progress (student_id, teacher_id, juz_number, state) values
    (pg_temp.f('T'),  null,            1, 'passed'),
    (pg_temp.f('S'),  pg_temp.f('T'),  1, 'in_progress'),
    (pg_temp.f('S2'), pg_temp.f('T'),  1, 'in_progress'),
    (pg_temp.f('S3'), pg_temp.f('T2'), 1, 'in_progress');
end $$;

-- ============ 1. profiles and identity ============
do $$
declare v text; v_name text;
begin
  perform pg_temp.as_postgres();
  select user_code, name into v, v_name from public.users where id = pg_temp.f('S');
  perform pg_temp.ok_if(v ~ '^[0-9]{6}$', 'profile created by trigger with a 6-digit user_code');
  perform pg_temp.ok_if(v_name = 'طالب', 'profile name taken from signup metadata');

  perform pg_temp.act('S');
  perform pg_temp.expect_fail(
    format('update public.users set user_code = %L where id = %L', '000001', pg_temp.f('S')),
    'user_code cannot be changed');
  perform pg_temp.expect_fail(
    format('update public.users set email = %L where id = %L', 'other@example.com', pg_temp.f('S')),
    'email cannot be changed on the profile');
  perform pg_temp.as_postgres();
end $$;

-- ============ 2. privacy and row-level security ============
do $$
declare n int;
begin
  perform pg_temp.act('X');
  select count(*) into n from public.users where id = pg_temp.f('S');
  perform pg_temp.ok_if(n = 0, 'stranger cannot read another profile (email/phone privacy)');
  select count(*) into n from public.progress where student_id = pg_temp.f('S');
  perform pg_temp.ok_if(n = 0, 'stranger cannot read another learner progress');
  select count(*) into n from public.quran_words where location = '2:255:1';
  perform pg_temp.ok_if(n = 1, 'signed-in user can read the Quran snapshot');
  perform pg_temp.expect_fail(
    format('insert into public.user_roles (user_id, role) values (%L, %L)', pg_temp.f('X'), 'admin'),
    'user cannot grant itself the admin role');

  perform pg_temp.act('T');
  select count(*) into n from public.users where id = pg_temp.f('S');
  perform pg_temp.ok_if(n = 1, 'teacher can see their own student profile');

  perform pg_temp.as_anon();
  select count(*) into n from public.quran_words;
  perform pg_temp.ok_if(n = 0, 'anonymous visitors cannot read the Quran snapshot');
  select count(*) into n from public.users;
  perform pg_temp.ok_if(n = 0, 'anonymous visitors cannot read profiles');
  perform pg_temp.as_postgres();
end $$;

-- ============ 3. progress and exam state machine ============
do $$
declare
  v_exam uuid; v_exam2 uuid; v_exam3 uuid; v_state text; v_prog_s uuid; v_prog_s2 uuid; n int; v_reason text;
begin
  perform pg_temp.as_postgres();
  select id into v_prog_s  from public.progress where student_id = pg_temp.f('S')  and juz_number = 1;
  select id into v_prog_s2 from public.progress where student_id = pg_temp.f('S2') and juz_number = 1;

  -- certified teacher nominates
  perform pg_temp.act('T');
  select public.nominate_for_exam(v_prog_s) into v_exam;
  select state into v_state from public.progress where id = v_prog_s;
  perform pg_temp.ok_if(v_state = 'nominated', 'nomination moves progress to nominated');

  perform pg_temp.expect_fail(format('select public.nominate_for_exam(%L)', v_prog_s),
    'cannot nominate twice');

  -- a teacher who has not passed the juz cannot nominate
  perform pg_temp.act('T2');
  perform pg_temp.expect_fail(
    format('select public.nominate_for_exam((select id from public.progress where student_id = %L and juz_number = 1))',
           pg_temp.f('S3')),
    'teacher not certified for the juz cannot nominate');

  -- examiner claims, then schedules
  perform pg_temp.act('E');
  update public.exams set examiner_id = pg_temp.f('E') where id = v_exam;
  get diagnostics n = row_count;
  perform pg_temp.ok_if(n = 1, 'committee member can claim an exam');
  perform pg_temp.expect_fail(format('update public.exams set state = %L where id = %L', 'scheduled', v_exam),
    'exam cannot be scheduled without a time');
  update public.exams set state = 'scheduled', scheduled_at = now() + interval '1 day',
         meeting_url = 'https://meet.google.com/test-abc' where id = v_exam;
  select state into v_state from public.progress where id = v_prog_s;
  perform pg_temp.ok_if(v_state = 'exam_scheduled', 'scheduling moves progress to exam_scheduled');

  -- only the committee completes an exam
  perform pg_temp.expect_fail(format('update public.exams set result = %L where id = %L', 'pass', v_exam),
    'result cannot be set before completion');
  perform pg_temp.act('T');
  update public.exams set state = 'completed', result = 'pass' where id = v_exam;
  get diagnostics n = row_count;
  perform pg_temp.ok_if(n = 0, 'nominating teacher cannot complete the exam (no write access)');

  -- pass: progress becomes passed, next juz unlocks, history is written
  perform pg_temp.act('E');
  update public.exams set state = 'completed', result = 'pass' where id = v_exam;
  perform pg_temp.as_postgres();
  select state into v_state from public.progress where id = v_prog_s;
  perform pg_temp.ok_if(v_state = 'passed', 'passing exam marks juz as passed');
  select count(*) into n from public.progress
    where student_id = pg_temp.f('S') and juz_number = 2 and state = 'in_progress';
  perform pg_temp.ok_if(n = 1, 'passing juz 1 unlocks juz 2');
  select count(*) into n from public.progress_state_history where progress_id = v_prog_s;
  perform pg_temp.ok_if(n = 3, 'every transition is written to history');

  -- a passed juz cannot be moved back by anyone
  perform pg_temp.act('T');
  perform pg_temp.expect_fail(format('update public.progress set state = %L where id = %L', 'in_progress', v_prog_s),
    'passed juz cannot be reopened');

  -- invalid transition from the teacher side
  perform pg_temp.expect_fail(format('update public.progress set state = %L where id = %L', 'passed', v_prog_s2),
    'teacher cannot mark a juz as passed directly');

  -- withdrawing a nomination cancels its open exam
  select public.nominate_for_exam(v_prog_s2) into v_exam2;
  update public.progress set state = 'in_progress' where id = v_prog_s2;
  perform pg_temp.as_postgres();
  select state, cancelled_reason into v_state, v_reason from public.exams where id = v_exam2;
  perform pg_temp.ok_if(v_state = 'cancelled' and v_reason = 'nomination_withdrawn',
    'withdrawing a nomination cancels the open exam');

  -- failed exam, then the teacher resumes the juz
  perform pg_temp.act('T');
  select public.nominate_for_exam(v_prog_s2) into v_exam3;
  perform pg_temp.act('E');
  update public.exams set examiner_id = pg_temp.f('E'), state = 'scheduled',
         scheduled_at = now() + interval '1 day' where id = v_exam3;
  update public.exams set state = 'completed', result = 'fail', notes = 'تحتاج مراجعة' where id = v_exam3;
  perform pg_temp.as_postgres();
  select state into v_state from public.progress where id = v_prog_s2;
  perform pg_temp.ok_if(v_state = 'failed', 'failing exam marks juz as failed');
  perform pg_temp.act('T');
  update public.progress set state = 'in_progress' where id = v_prog_s2;
  select state into v_state from public.progress where id = v_prog_s2;
  perform pg_temp.ok_if(v_state = 'in_progress', 'teacher can resume a failed juz');
  perform pg_temp.as_postgres();
end $$;

-- ============ 4. lineage, eligibility and auto-assignment ============
do $$
declare n int; v_teacher uuid; v_s5 uuid;
begin
  perform pg_temp.act('T');
  select count(*) into n from public.get_lineage_tree(null)
    where user_id = pg_temp.f('S') and juz_number = 1 and depth = 1;
  perform pg_temp.ok_if(n = 1, 'lineage tree shows the student certified by the teacher');

  perform pg_temp.as_postgres();
  select count(*) into n from public.v_teacher_eligibility
    where user_id = pg_temp.f('T') and juz_number = 1;
  perform pg_temp.ok_if(n = 1, 'teacher eligibility derived from passed progress');

  -- a new learner gets the least-loaded certified teacher (S has no active learners, T has one)
  perform pg_temp.act('S5');
  select public.auto_assign_teacher() into v_teacher;
  perform pg_temp.ok_if(v_teacher = pg_temp.f('S'),
    'auto-assignment picks the least-loaded certified teacher for juz 1');
  select count(*) into n from public.progress
    where student_id = pg_temp.f('S5') and juz_number = 1 and teacher_id = pg_temp.f('S');
  perform pg_temp.ok_if(n = 1, 'auto-assignment stores the teacher on the progress row');
  perform pg_temp.as_postgres();
end $$;

-- ============ 5. mushaf sessions, errors, acceptance, repeat counting ============
do $$
declare
  v_talq smallint; v_madd smallint;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid; v_s6 uuid;
  v_state text; n int; v_cnt bigint;
begin
  perform pg_temp.as_postgres();
  select id into v_talq from public.error_types where code = 'talqeen';
  select es.id into v_madd from public.error_subtypes es
    join public.error_types et on et.id = es.error_type_id
    where et.code = 'tajweed' and es.code = 'madd';

  -- listener opens a session and marks a word
  perform pg_temp.act('L');
  insert into public.mushaf_sessions (reciter_id, listener_id)
    values (pg_temp.f('R'), pg_temp.f('L')) returning id into v_s1;
  perform pg_temp.expect_fail(format('select public.send_session(%L)', v_s1), 'an empty session cannot be sent');
  insert into public.mushaf_errors (session_id, reciter_id, marker_id, location, error_type_id)
    values (v_s1, pg_temp.f('R'), pg_temp.f('L'), '2:255:1', v_talq);
  perform pg_temp.expect_fail(
    format('insert into public.mushaf_errors (session_id, reciter_id, marker_id, location, error_type_id, subtype_id) values (%L,%L,%L,%L,%s,%s)',
           v_s1, pg_temp.f('R'), pg_temp.f('L'), '2:255:2', v_talq, v_madd),
    'a sub-type must belong to its error type');

  -- bismillah is not markable
  perform pg_temp.act('R');
  perform pg_temp.expect_fail(
    format('insert into public.mushaf_errors (reciter_id, marker_id, location, error_type_id) values (%L,%L,%L,%s)',
           pg_temp.f('R'), pg_temp.f('R'), '1:1:1', v_talq),
    'bismillah (1:1) is not markable');

  -- the listener sends; the draft is then locked
  perform pg_temp.act('L');
  select public.send_session(v_s1) into v_state;
  perform pg_temp.ok_if(v_state = 'awaiting_reciter_approval', 'listener sends a session for approval');
  perform pg_temp.expect_fail(
    format('insert into public.mushaf_errors (session_id, reciter_id, marker_id, location, error_type_id) values (%L,%L,%L,%L,%s)',
           v_s1, pg_temp.f('R'), pg_temp.f('L'), '2:255:3', v_talq),
    'marks cannot be added after sending');
  perform pg_temp.expect_fail(format('select public.respond_to_session(%L, true)', v_s1),
    'listener cannot accept its own session');

  -- the reciter sees nothing until approval
  perform pg_temp.act('R');
  select count(*) into n from public.mushaf_errors where session_id = v_s1;
  perform pg_temp.ok_if(n = 0, 'reciter cannot see marks of a session not yet accepted');
  select public.respond_to_session(v_s1, true) into v_state;
  perform pg_temp.ok_if(v_state = 'accepted', 'reciter accepts the session');
  select count(*) into n from public.mushaf_errors where session_id = v_s1;
  perform pg_temp.ok_if(n = 1, 'reciter sees marks once accepted');
  perform pg_temp.expect_fail(format('select public.respond_to_session(%L, false)', v_s1),
    'a session cannot be answered twice');

  -- second accepted session with the same word and type → repeat count 2
  perform pg_temp.act('L');
  insert into public.mushaf_sessions (reciter_id, listener_id)
    values (pg_temp.f('R'), pg_temp.f('L')) returning id into v_s2;
  insert into public.mushaf_errors (session_id, reciter_id, marker_id, location, error_type_id)
    values (v_s2, pg_temp.f('R'), pg_temp.f('L'), '2:255:1', v_talq);
  select public.send_session(v_s2) into v_state;
  perform pg_temp.act('R');
  select public.respond_to_session(v_s2, true) into v_state;

  -- third session rejected with the same word → must not count
  perform pg_temp.act('L');
  insert into public.mushaf_sessions (reciter_id, listener_id)
    values (pg_temp.f('R'), pg_temp.f('L')) returning id into v_s3;
  insert into public.mushaf_errors (session_id, reciter_id, marker_id, location, error_type_id)
    values (v_s3, pg_temp.f('R'), pg_temp.f('L'), '2:255:1', v_talq);
  select public.send_session(v_s3) into v_state;
  perform pg_temp.act('R');
  select public.respond_to_session(v_s3, false) into v_state;
  perform pg_temp.ok_if(v_state = 'rejected', 'reciter rejects a session');

  perform pg_temp.as_postgres();
  select repeat_count into v_cnt from public.v_error_repeat_counts
    where reciter_id = pg_temp.f('R') and location = '2:255:1' and error_type_id = v_talq;
  perform pg_temp.ok_if(v_cnt = 2, 'repeat count counts accepted sessions only (expected 2)');

  -- a pending session's marks are invisible to the reciter (second check, separate session)
  perform pg_temp.act('L');
  insert into public.mushaf_sessions (reciter_id, listener_id)
    values (pg_temp.f('R'), pg_temp.f('L')) returning id into v_s4;
  insert into public.mushaf_errors (session_id, reciter_id, marker_id, location, error_type_id)
    values (v_s4, pg_temp.f('R'), pg_temp.f('L'), '2:255:4', v_talq);
  select public.send_session(v_s4) into v_state;
  perform pg_temp.act('R');
  select count(*) into n from public.mushaf_errors where session_id = v_s4;
  perform pg_temp.ok_if(n = 0, 'pending marks stay hidden from the reciter (second session)');

  -- drafts are the listener's private work: the reciter must not see them
  perform pg_temp.act('L');
  insert into public.mushaf_sessions (reciter_id, listener_id)
    values (pg_temp.f('R'), pg_temp.f('L')) returning id into v_s6;
  perform pg_temp.act('R');
  select count(*) into n from public.mushaf_sessions
    where reciter_id = pg_temp.f('R') and state = 'draft';
  perform pg_temp.ok_if(n = 0, 'reciter cannot see the listener draft sessions');

  -- auto-accept: the reciter trusts the listener, so the session is accepted at once
  perform pg_temp.act('R');
  insert into public.auto_accept_list (reciter_id, listener_id) values (pg_temp.f('R'), pg_temp.f('L'));
  perform pg_temp.act('L');
  insert into public.mushaf_sessions (reciter_id, listener_id)
    values (pg_temp.f('R'), pg_temp.f('L')) returning id into v_s5;
  insert into public.mushaf_errors (session_id, reciter_id, marker_id, location, error_type_id)
    values (v_s5, pg_temp.f('R'), pg_temp.f('L'), '2:255:5', v_talq);
  select public.send_session(v_s5) into v_state;
  perform pg_temp.ok_if(v_state = 'accepted', 'auto-accept trusted listener is accepted immediately');

  -- contact details: visible to the session partner, not to strangers
  perform pg_temp.act('L');
  select count(*) into n from public.users where id = pg_temp.f('R');
  perform pg_temp.ok_if(n = 1, 'session partners can see each other (non-draft session)');
  perform pg_temp.act('X');
  select count(*) into n from public.users where id = pg_temp.f('R');
  perform pg_temp.ok_if(n = 0, 'strangers cannot see the reciter contact details');
  perform pg_temp.as_postgres();
end $$;

-- ============ 6. invites ============
do $$
declare v_token text; v_teacher uuid; n int;
begin
  perform pg_temp.act('X');
  perform pg_temp.expect_fail(
    format('insert into public.invites (teacher_id) values (%L)', pg_temp.f('X')),
    'a learner without a passed juz cannot create invites');

  perform pg_temp.act('T');
  insert into public.invites (teacher_id) values (pg_temp.f('T')) returning token into v_token;
  perform pg_temp.act('S4');
  select public.accept_invite(v_token) into v_teacher;
  perform pg_temp.ok_if(v_teacher = pg_temp.f('T'), 'invite links the learner to the teacher');
  select count(*) into n from public.progress
    where student_id = pg_temp.f('S4') and juz_number = 1 and teacher_id = pg_temp.f('T');
  perform pg_temp.as_postgres();
  perform pg_temp.ok_if(n = 1, 'invite creates the progress row for the current juz');

  perform pg_temp.act('S5');
  perform pg_temp.expect_fail(format('select public.accept_invite(%L)', v_token), 'an invite is single-use');
  perform pg_temp.act('T');
  insert into public.invites (teacher_id) values (pg_temp.f('T')) returning token into v_token;
  perform pg_temp.expect_fail(format('select public.accept_invite(%L)', v_token),
    'a teacher cannot use their own invite');
  perform pg_temp.as_postgres();
end $$;

-- ============ 7. common errors ============
do $$
declare v_cat smallint; v_id uuid; n int;
begin
  perform pg_temp.as_postgres();
  select id into v_cat from public.common_error_categories order by sort limit 1;

  perform pg_temp.act('S');
  insert into public.common_errors (category_id, correct_text, incorrect_text, submitted_by)
    values (v_cat, 'وَطُورِ', 'وَطُورِي', pg_temp.f('S')) returning id into v_id;
  perform pg_temp.expect_fail(
    format('insert into public.common_errors (category_id, correct_text, incorrect_text, submitted_by, state) values (%s,%L,%L,%L,%L)',
           v_cat, 'a', 'b', pg_temp.f('S'), 'approved'),
    'a submission cannot be created already approved');

  perform pg_temp.act('X');
  select count(*) into n from public.common_errors where id = v_id;
  perform pg_temp.ok_if(n = 0, 'pending submissions are private to the submitter');

  perform pg_temp.act('A');
  update public.common_errors set state = 'approved', reviewed_by = pg_temp.f('A') where id = v_id;
  perform pg_temp.act('X');
  select count(*) into n from public.common_errors where id = v_id;
  perform pg_temp.ok_if(n = 1, 'approved submissions are visible to all learners');
  perform pg_temp.as_postgres();
end $$;

-- ============ 8. function privileges and RLS coverage ============
do $$
declare n int;
begin
  perform pg_temp.as_postgres();
  perform pg_temp.ok_if(not has_function_privilege('anon', 'public.guard_progress_update()', 'EXECUTE'),
    'anon cannot call the progress guard trigger function');
  perform pg_temp.ok_if(not has_function_privilege('authenticated', 'public.notify(uuid,text,jsonb)', 'EXECUTE'),
    'signed-in users cannot call notify() directly');
  perform pg_temp.ok_if(not has_function_privilege('anon', 'public.is_admin()', 'EXECUTE'),
    'anon cannot call is_admin()');
  perform pg_temp.ok_if(has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE'),
    'signed-in users can call is_admin() (used by RLS)');
  perform pg_temp.ok_if(has_function_privilege('authenticated', 'public.get_lineage_tree(uuid)', 'EXECUTE'),
    'signed-in users can call get_lineage_tree()');
  select count(*) into n from pg_tables where schemaname = 'public' and not rowsecurity;
  perform pg_temp.ok_if(n = 0, 'row-level security is enabled on every public table');
end $$;

rollback;

select 'DB TESTS PASSED (all changes rolled back)' as result;
