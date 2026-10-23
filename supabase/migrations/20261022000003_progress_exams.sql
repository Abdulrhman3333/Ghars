-- 0003 · per-juz progress + exam attempts, with DB-enforced state machines.
-- Cross-trigger cascades are marked with the transaction-local GUC 'ghars.cascade'='on'.

-- ============ progress (one row per student × juz, ever) ============
create table public.progress (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.users(id) on delete cascade,
  teacher_id    uuid references public.users(id),        -- current teacher; lineage uses exams.nominated_by
  juz_number    smallint not null check (juz_number between 1 and 30),
  state         text not null default 'in_progress'
                check (state in ('in_progress','nominated','exam_scheduled','passed','failed')),
  started_date  timestamptz not null default now(),
  finished_date timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (student_id, juz_number)
);
create index progress_teacher_idx on public.progress(teacher_id) where teacher_id is not null;
create index progress_state_idx   on public.progress(state);

create trigger progress_set_updated_at
  before update on public.progress
  for each row execute function public.set_updated_at();

create table public.progress_state_history (
  id          bigint generated always as identity primary key,
  progress_id uuid not null references public.progress(id) on delete cascade,
  from_state  text not null,
  to_state    text not null,
  actor_id    uuid references public.users(id),
  created_at  timestamptz not null default now()
);
create index progress_state_history_progress_idx on public.progress_state_history(progress_id);

-- valid transitions: who may move progress from one state to another
create table public.progress_allowed_transitions (
  from_state text not null,
  to_state   text not null,
  actor      text not null check (actor in ('teacher','admin','system')),
  primary key (from_state, to_state, actor)
);
insert into public.progress_allowed_transitions (from_state, to_state, actor) values
  ('in_progress',    'nominated',      'teacher'),   -- nominate for exam
  ('in_progress',    'nominated',      'admin'),
  ('nominated',      'in_progress',    'teacher'),   -- withdraw nomination
  ('nominated',      'in_progress',    'admin'),
  ('nominated',      'in_progress',    'system'),    -- exam cancelled (cascade)
  ('nominated',      'exam_scheduled', 'system'),    -- exam scheduled (cascade)
  ('nominated',      'exam_scheduled', 'admin'),
  ('exam_scheduled', 'in_progress',    'system'),    -- exam cancelled (cascade)
  ('exam_scheduled', 'in_progress',    'admin'),
  ('exam_scheduled', 'passed',         'system'),    -- exam completed (cascade)
  ('exam_scheduled', 'passed',         'admin'),
  ('exam_scheduled', 'failed',         'system'),
  ('exam_scheduled', 'failed',         'admin'),
  ('failed',         'in_progress',    'teacher'),   -- repeat the juz, re-nominate later
  ('failed',         'in_progress',    'admin');

create or replace function public.guard_progress_update() returns trigger
language plpgsql security definer set search_path = public as
$$
declare
  v_actor text;
begin
  if new.student_id is distinct from old.student_id
     or new.juz_number is distinct from old.juz_number then
    raise exception 'progress: student and juz can never change';
  end if;
  if new.teacher_id is distinct from old.teacher_id
     and not public.is_admin()
     and current_setting('ghars.cascade', true) is distinct from 'on' then
    raise exception 'progress: only an admin can reassign the teacher';
  end if;

  if new.state is distinct from old.state then
    if current_setting('ghars.cascade', true) = 'on' then
      v_actor := 'system';
    elsif public.is_admin() then
      v_actor := 'admin';
    elsif old.teacher_id = public.current_profile_id() then
      v_actor := 'teacher';
    end if;

    if v_actor is null or not exists (
      select 1 from public.progress_allowed_transitions
      where from_state = old.state and to_state = new.state and actor = v_actor
    ) then
      raise exception 'progress: invalid state transition % -> %', old.state, new.state;
    end if;

    insert into public.progress_state_history (progress_id, from_state, to_state, actor_id)
    values (old.id, old.state, new.state, public.current_profile_id());

    if new.state = 'passed' then
      new.finished_date := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger progress_guard
  before update on public.progress
  for each row execute function public.guard_progress_update();

-- withdrawing a nomination cancels the still-unscheduled exam rows (cascade, AFTER so
-- the progress row is already in its final state and the exam sync finds nothing to do)
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
  end if;
  return new;
end;
$$;

create trigger progress_after_withdraw
  after update on public.progress
  for each row execute function public.after_progress_withdraw();

-- passing juz N unlocks juz N+1 and notifies the student
create or replace function public.after_progress_pass() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  if new.state = 'passed' and old.state is distinct from 'passed' then
    if new.juz_number < 30 then
      insert into public.progress (student_id, teacher_id, juz_number, state)
      values (new.student_id, null, new.juz_number + 1, 'in_progress')
      on conflict (student_id, juz_number) do nothing;
    end if;
    perform public.notify(new.student_id, 'juz_passed',
      jsonb_build_object('juz_number', new.juz_number));
  end if;
  return new;
end;
$$;

create trigger progress_after_pass
  after update on public.progress
  for each row execute function public.after_progress_pass();

-- ============ exams (every attempt is a row; nothing is overwritten) ============
create table public.exams (
  id               uuid primary key default gen_random_uuid(),
  progress_id      uuid not null references public.progress(id) on delete cascade,
  student_id       uuid not null references public.users(id),
  juz_number       smallint not null check (juz_number between 1 and 30),
  nominated_by     uuid not null references public.users(id),   -- lineage parent on pass
  examiner_id      uuid references public.users(id),
  state            text not null default 'nominated'
                   check (state in ('nominated','scheduled','completed','cancelled')),
  result           text check (result in ('pass','fail')),
  notes            text,
  meeting_url      text,
  scheduled_at     timestamptz,
  completed_at     timestamptz,
  cancelled_reason text,
  created_at       timestamptz not null default now(),
  check (state <> 'completed' or result is not null)
);
create index exams_progress_idx   on public.exams(progress_id);
create index exams_student_idx    on public.exams(student_id);
create index exams_examiner_idx   on public.exams(examiner_id);
create index exams_nominated_idx  on public.exams(nominated_by);
create index exams_queue_idx      on public.exams(state) where state = 'nominated';

create table public.exam_allowed_transitions (
  from_state text not null,
  to_state   text not null,
  actor      text not null check (actor in ('teacher','examiner','admin','system')),
  primary key (from_state, to_state, actor)
);
insert into public.exam_allowed_transitions (from_state, to_state, actor) values
  ('nominated', 'scheduled', 'examiner'),   -- claim/assign + schedule
  ('nominated', 'scheduled', 'admin'),
  ('nominated', 'cancelled', 'examiner'),
  ('nominated', 'cancelled', 'admin'),
  ('nominated', 'cancelled', 'system'),     -- nomination withdrawn (cascade)
  ('scheduled', 'completed', 'examiner'),
  ('scheduled', 'completed', 'admin'),
  ('scheduled', 'cancelled', 'examiner'),
  ('scheduled', 'cancelled', 'admin');

create or replace function public.guard_exam_update() returns trigger
language plpgsql security definer set search_path = public as
$$
declare
  v_actor text;
begin
  if new.progress_id  is distinct from old.progress_id
     or new.student_id   is distinct from old.student_id
     or new.juz_number   is distinct from old.juz_number
     or new.nominated_by is distinct from old.nominated_by then
    raise exception 'exam: immutable fields';
  end if;

  -- claiming: only committee members (or admin) may set/change the examiner, and only before close
  if new.examiner_id is distinct from old.examiner_id then
    if old.state not in ('nominated','scheduled') then
      raise exception 'exam: examiner cannot change after the exam is closed';
    end if;
    if not (public.is_admin()
            or (public.is_examiner() and new.examiner_id = public.current_profile_id())) then
      raise exception 'exam: only a committee member can claim an exam';
    end if;
  end if;

  -- the result may only be set together with completion (never on an open exam)
  if new.result is distinct from old.result
     and not (new.state = 'completed' and new.state is distinct from old.state) then
    raise exception 'exam: result can only be set when completing the exam';
  end if;

  if new.state is distinct from old.state then
    if current_setting('ghars.cascade', true) = 'on' then
      v_actor := 'system';
    elsif public.is_admin() then
      v_actor := 'admin';
    elsif public.is_examiner()
          and (old.examiner_id = public.current_profile_id()
               or new.examiner_id = public.current_profile_id()) then
      v_actor := 'examiner';
    end if;

    if v_actor is null or not exists (
      select 1 from public.exam_allowed_transitions
      where from_state = old.state and to_state = new.state and actor = v_actor
    ) then
      raise exception 'exam: invalid state transition % -> %', old.state, new.state;
    end if;

    if new.state = 'scheduled' then
      if new.examiner_id is null then
        raise exception 'exam: an examiner must be assigned before scheduling';
      end if;
      if new.scheduled_at is null then
        raise exception 'exam: scheduled_at is required';
      end if;
    elsif new.state = 'completed' then
      if new.result is null then
        raise exception 'exam: result (pass|fail) is required';
      end if;
      if new.completed_at is null then
        new.completed_at := now();
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger exams_guard
  before update on public.exams
  for each row execute function public.guard_exam_update();

-- exam lifecycle drives the progress state machine (single source of truth for pass/fail)
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
  return new;
end;
$$;

create trigger exams_sync_progress
  after update on public.exams
  for each row execute function public.sync_progress_from_exam();

-- ============ nomination (atomic: progress → nominated + exam row + notification) ============
create or replace function public.nominate_for_exam(p_progress_id uuid) returns uuid
language plpgsql security definer set search_path = public as
$$
declare
  p         public.progress%rowtype;
  v_me      uuid := public.current_profile_id();
  v_exam_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  select * into p from public.progress where id = p_progress_id for update;
  if not found then
    raise exception 'progress row not found';
  end if;
  if p.state <> 'in_progress' then
    raise exception 'nomination requires state in_progress, current: %', p.state;
  end if;
  if not public.is_admin() then
    if p.teacher_id is distinct from v_me then
      raise exception 'only the assigned teacher can nominate this student';
    end if;
    if not exists (
      select 1 from public.progress tp
      where tp.student_id = v_me and tp.juz_number = p.juz_number and tp.state = 'passed'
    ) then
      raise exception 'you are not certified for juz %', p.juz_number;
    end if;
  end if;

  update public.progress set state = 'nominated' where id = p.id;

  insert into public.exams (progress_id, student_id, juz_number, nominated_by)
  values (p.id, p.student_id, p.juz_number, coalesce(p.teacher_id, v_me))
  returning id into v_exam_id;

  perform public.notify(p.student_id, 'exam_nomination',
    jsonb_build_object('juz_number', p.juz_number));
  return v_exam_id;
end;
$$;
