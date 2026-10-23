-- Demo data for illustrating the platform (~15 students + teachers + examiner).
-- Idempotent: running it again does nothing (it skips if demo users exist).
-- All demo accounts share the password 'GharsDemo#2026' (they are demo-only; admin also sees their names).
-- Run as postgres / Supabase SQL editor. States are set by direct owner writes (bypass RLS as owner),
-- so they never touch application trigger paths.

do $demo$
declare
  v_pass text := 'GharsDemo#2026';
  t1 uuid; t2 uuid; ex uuid; s8 uuid; s9 uuid;
  u uuid; v_s6 uuid; v_s7 uuid; v_s12 uuid; v_s10 uuid; v_s13 uuid; v_s11 uuid;
  e uuid; sess uuid; v_talq smallint; v_taj smallint; v_madd smallint;
  v_sb smallint;
begin
  -- guard: fully seeded projects are skipped (partial failures may leave partial data)
  if exists (
    select 1 from public.mushaf_sessions s
    join public.users u on u.id = s.reciter_id
    where u.email like 'demo-%@ghars-demo.local'
  ) then
    raise notice 'demo seed: already seeded, skipping';
    return;
  end if;

  -- make every demo user: auth row (confirmed instantly by auto_confirm_signup) + profile trigger
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token, is_sso_user, is_anonymous
  )
  select
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    d.email, extensions.crypt(v_pass, extensions.gen_salt('bf')), now(),
    jsonb_build_object('name', d.name, 'age_range', '25_34', 'preferred_contact', 'whatsapp'),
    '{"provider":"email","providers":["email"]}'::jsonb, now() - interval '30 days', now(),
    '', '', '', '', '', '', false, false
  from (values ('demo-t1@ghars-demo.local',   'يوسف الأنصاري'),
               ('demo-t2@ghars-demo.local',   'عبد الله الرحيمي'),
               ('demo-examiner@ghars-demo.local', 'إبراهيم لحودي'),
               ('demo-x08@ghars-demo.local',  'خالد المزيّن'),
               ('demo-x09@ghars-demo.local',  'سامي الحريبي'),
               ('demo-x01@ghars-demo.local',  'أحمد الشمري'),
               ('demo-x02@ghars-demo.local',  'بدر العتيبي'),
               ('demo-x03@ghars-demo.local',  'تركي الدوسري'),
               ('demo-x04@ghars-demo.local',  'جمال الهاجري'),
               ('demo-x05@ghars-demo.local',  'حاتم البقمي'),
               ('demo-x06@ghars-demo.local',  'حسام الغامدي'),
               ('demo-x07@ghars-demo.local',  'رضا السلمي'),
               ('demo-x10@ghars-demo.local',  'طلال القحطاني'),
               ('demo-x11@ghars-demo.local',  'عايض المتيري'),
               ('demo-x12@ghars-demo.local',  'غسان الرشيدي'),
               ('demo-x13@ghars-demo.local',  'فهد العنزي'),
               ('demo-x14@ghars-demo.local',  'لمى السديري'),
               ('demo-x15@ghars-demo.local',  'مهرة العبيدي')) as d(email, name)
  where not exists (select 1 from auth.users au where lower(au.email) = lower(d.email));

  select id into t1 from public.users where email = 'demo-t1@ghars-demo.local';
  select id into t2 from public.users where email = 'demo-t2@ghars-demo.local';
  select id into ex from public.users where email = 'demo-examiner@ghars-demo.local';
  select id into s8 from public.users where email = 'demo-x08@ghars-demo.local';
  select id into s9 from public.users where email = 'demo-x09@ghars-demo.local';
  select id into v_s6 from public.users where email = 'demo-x06@ghars-demo.local';
  select id into v_s7 from public.users where email = 'demo-x07@ghars-demo.local';
  select id into v_s10 from public.users where email = 'demo-x10@ghars-demo.local';
  select id into v_s12 from public.users where email = 'demo-x12@ghars-demo.local';

  if t1 is null then
    raise exception 'demo seed: profiles were not created (trigger)';
  end if;

  -- roles: examiner for the demo committee member
  insert into public.user_roles (user_id, role, granted_by) values (ex, 'examiner', t1)
    on conflict do nothing;

  -- ============ certification lineage (derived from PASSED attempts) ============
  -- T1 holds juz' 1-3; T2 holds 1-2 — via completed pass exams
  insert into public.progress (student_id, juz_number, state) values (t1, 1, 'passed'), (t1, 2, 'passed'), (t1, 3, 'passed'), (t2, 1, 'passed'), (t2, 2, 'passed')
    on conflict (student_id, juz_number) do nothing;

  -- exams join their progress row: exams.progress_id is NOT NULL
  insert into public.exams (progress_id, student_id, juz_number, nominated_by, examiner_id, state, result, scheduled_at, meeting_url, completed_at)
  select p.id, p.student_id, p.juz_number, v.nom, ex, 'completed', 'pass', v.t - interval '30 days', 'https://meet.google.com/demo', v.t
  from (values
    (t1::uuid, 1::int, t1::uuid, now() - interval '200 days'),
    (t1, 2, t1, now() - interval '160 days'),
    (t1, 3, t1, now() - interval '120 days'),
    (t2, 1, t1, now() - interval '150 days'),
    (t2, 2, t1, now() - interval '110 days')
  ) as v(student, juz, nom, t)
  join public.progress p on p.student_id = v.student and p.juz_number = v.juz
  on conflict do nothing;

  -- students who already passed (they demo the tree + the derived teacher status)
  insert into public.progress (student_id, juz_number, state) values (s8, 1, 'passed'), (s9, 1, 'passed'), (s9, 2, 'passed')
    on conflict (student_id, juz_number) do nothing;
  insert into public.exams (progress_id, student_id, juz_number, nominated_by, examiner_id, state, result, scheduled_at, meeting_url, completed_at)
  select p.id, p.student_id, p.juz_number, v.nom, ex, 'completed', 'pass', v.t - interval '30 days', 'https://meet.google.com/demo', v.t
  from (values
    (s8::uuid, 1::int, t1::uuid, now() - interval '40 days'),
    (s9, 1, t1, now() - interval '70 days'),
    (s9, 2, t2, now() - interval '35 days')
  ) as v(student, juz, nom, t)
  join public.progress p on p.student_id = v.student and p.juz_number = v.juz
  on conflict do nothing;

  -- ============ current learning rows ============
  -- x01..x04 studying ج 1 under T1
  insert into public.progress (student_id, teacher_id, juz_number, state) values
    ((select id from public.users where email='demo-x01@ghars-demo.local'), t1, 1, 'in_progress'),
    ((select id from public.users where email='demo-x02@ghars-demo.local'), t1, 1, 'in_progress'),
    ((select id from public.users where email='demo-x03@ghars-demo.local'), t1, 1, 'in_progress'),
    ((select id from public.users where email='demo-x04@ghars-demo.local'), t2, 1, 'in_progress'),
    -- x05: ج 2 under T2 (passed ج1 with T1, certified)
    (s8,  t2, 2, 'in_progress'),
    -- x10, x11 studying ج 1 under S9 (a student-turned-teacher → depth 2 in the tree)
    (v_s10, s9, 1, 'in_progress'),
    ((select id from public.users where email='demo-x11@ghars-demo.local'), s9, 1, 'in_progress'),
    -- x12: failed ج1 exam, resumed
    (v_s12, t1, 1, 'in_progress'),
    -- x13: passed ج1 (deep lineage: T1 → S9 → x13)
    ((select id from public.users where email='demo-x13@ghars-demo.local'), null, 1, 'passed'),
    -- x14, x15: brand new, no teacher yet (auto-assign demo)
    ((select id from public.users where email='demo-x14@ghars-demo.local'), null, 1, 'in_progress'),
    ((select id from public.users where email='demo-x15@ghars-demo.local'), null, 1, 'in_progress')
  on conflict (student_id, juz_number) do nothing;

  select id into v_s13 from public.users where email='demo-x13@ghars-demo.local';
  insert into public.exams (progress_id, student_id, juz_number, nominated_by, examiner_id, state, result, scheduled_at, meeting_url, completed_at)
  select p.id, p.student_id, p.juz_number, s9, ex, 'completed', 'pass', now() - interval '40 days', 'https://meet.google.com/demo', now() - interval '10 days'
  from public.progress p where p.student_id = v_s13 and p.juz_number = 1
  on conflict do nothing;

  -- ============ open nominations / scheduled exam (committee queue demo) ============
  -- fresh rows; no upsert — progress transitions for existing rows would need the cascade flag
  insert into public.progress (student_id, teacher_id, juz_number, state) values (v_s6, t1, 1, 'nominated'), (v_s7, t1, 1, 'exam_scheduled')
    on conflict (student_id, juz_number) do nothing;
  insert into public.exams (progress_id, student_id, juz_number, nominated_by, state, created_at)
  select p.id, p.student_id, p.juz_number, t1, 'nominated', now() - interval '2 days'
  from public.progress p where p.student_id = v_s6 and p.juz_number = 1
  on conflict do nothing;
  e := (select id from public.progress p where p.student_id = v_s7 and p.juz_number = 1);
  insert into public.exams (progress_id, student_id, juz_number, nominated_by, examiner_id, state, scheduled_at, meeting_url, created_at)
  select p.id, p.student_id, p.juz_number, t1, ex, 'scheduled', now() + interval '3 days', 'https://meet.google.com/demo-exam', now() - interval '3 days'
  from public.progress p where p.student_id = v_s7 and p.juz_number = 1
  on conflict do nothing;

  -- failed exam record for x12 (joined to his resumed juz 1 progress row)
  insert into public.exams (progress_id, student_id, juz_number, nominated_by, examiner_id, state, result, scheduled_at, meeting_url, completed_at, notes)
  select p.id, p.student_id, p.juz_number, t1, ex, 'completed', 'fail', now() - interval '35 days', 'https://meet.google.com/demo', now() - interval '5 days', 'يحتاج مراجعة مخرج الضاد والميم الساكنة.'
  from public.progress p where p.student_id = v_s12 and p.juz_number = 1
  on conflict do nothing;

  -- ============ recitation sessions (accepted, with error marks) ============
  select id into v_talq from public.error_types where code = 'talqeen';
  select id into v_taj  from public.error_types where code = 'tajweed';
  select es.id into v_madd from public.error_subtypes es where es.error_type_id = v_taj and es.code = 'madd';
  select et.id into v_sb from public.error_types et where et.code = 'tanbeeh';

  -- session 1: T1 listened to S8 (accepted)
  insert into public.mushaf_sessions (reciter_id, listener_id, session_date) values (s8, t1, now() - interval '6 days')
    returning id into sess;
  insert into public.mushaf_errors (session_id, reciter_id, marker_id, location, error_type_id, subtype_id) values
    (sess, s8, t1, '2:255:1', v_talq, null), (sess, s8, t1, '2:255:2', v_taj, v_madd);
  update public.mushaf_sessions set state = 'accepted', sent_at = now() - interval '6 days', responded_at = now() - interval '6 days' where id = sess;

  -- session 2: T1 listened to S12 (same word repeated → repeat-count demo)
  insert into public.mushaf_sessions (reciter_id, listener_id, session_date) values (v_s12, t1, now() - interval '2 days')
    returning id into sess;
  insert into public.mushaf_errors (session_id, reciter_id, marker_id, location, error_type_id) values
    (sess, v_s12, t1, '2:255:1', v_talq);
  update public.mushaf_sessions set state = 'accepted', sent_at = now() - interval '2 days', responded_at = now() - interval '2 days' where id = sess;

  -- session 3: T1 listened to S9
  insert into public.mushaf_sessions (reciter_id, listener_id, session_date) values (s9, t1, now() - interval '20 days')
    returning id into sess;
  insert into public.mushaf_errors (session_id, reciter_id, marker_id, location, error_type_id, subtype_id) values
    (sess, s9, t1, '112:1:1', v_taj, v_madd);
  update public.mushaf_sessions set state = 'accepted', sent_at = now() - interval '20 days', responded_at = now() - interval '20 days' where id = sess;

  -- pending approval (T2's inbox demo)
  insert into public.mushaf_sessions (reciter_id, listener_id, session_date) values (t2, s8, now())
    returning id into sess;
  insert into public.mushaf_errors (session_id, reciter_id, marker_id, location, error_type_id) values
    (sess, t2, s8, '1:2:2', v_talq);
  update public.mushaf_sessions set state = 'awaiting_reciter_approval', sent_at = now() where id = sess;

  -- T1 has one open draft marking S9's recitation
  insert into public.mushaf_sessions (reciter_id, listener_id, session_date) values (s9, t1, now())
    returning id into sess;
  insert into public.mushaf_errors (session_id, reciter_id, marker_id, location, error_type_id) values
    (sess, s9, t1, '93:4:1', v_sb);

  -- ============ chat samples ============
  insert into public.chat_messages (sender_id, recipient_id, body, created_at, read_at) values
    (t1, s8, 'أحسنت اليوم على تلاوة البقرة. راجع مدّ الياء في آية الكرسي.', now() - interval '2 days', now() - interval '1 day'),
    (s8, t1, 'تم يا معلم، سأراجعها وأرسل لك جلسة التسميع غدًا.', now() - interval '1 day', now() - interval '1 day'),
    (t1, v_s10, 'مرحبًا بك في غرس! نُعيّنتُ لك لأجل الأول. متى تناسبك جلسة أولى؟', now() - interval '3 hours', null);

  -- ============ notifications ============
  perform public.notify(t1, 'student_assigned', jsonb_build_object('juz_number', 1));
  perform public.notify(v_s7, 'exam_scheduled', jsonb_build_object('juz_number', 1));
  perform public.notify(s8, 'session_received', jsonb_build_object('session_id', sess));
end $demo$;
