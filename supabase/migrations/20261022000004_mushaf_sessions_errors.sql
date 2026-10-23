-- 0004 · electronic Mushaf: error types/subtypes, recitation sessions, word errors, auto-accept.
-- An error targets ONE word or letters inside ONE word — never a range.
-- Self-marking = mushaf_errors row with session_id NULL and marker_id = reciter_id.

-- ============ reference: error types & subtypes (admin-extensible, no code changes) ============
create table public.error_types (
  id        smallint generated always as identity primary key,
  code      text not null unique,                 -- talqeen | tanbeeh | tajweed | ...
  name_ar   text not null,
  color_hex text not null check (color_hex ~ '^#[0-9a-fA-F]{6}$'),
  sort      smallint not null default 0
);

create table public.error_subtypes (
  id            smallint generated always as identity primary key,
  error_type_id smallint not null references public.error_types(id) on delete cascade,
  code          text not null,
  name_ar       text not null,
  sort          smallint not null default 0,
  unique (error_type_id, code),
  unique (error_type_id, id)   -- enables the composite FK from mushaf_errors
);

-- ============ recitation sessions (listener marks, reciter approves) ============
create table public.mushaf_sessions (
  id           uuid primary key default gen_random_uuid(),
  reciter_id   uuid not null references public.users(id),
  listener_id  uuid not null references public.users(id),
  session_date timestamptz not null default now(),
  state        text not null default 'draft'
               check (state in ('draft','awaiting_reciter_approval','accepted','rejected')),
  range_start  text references public.quran_words(location),   -- optional session range
  range_end    text references public.quran_words(location),
  sent_at      timestamptz,
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  check (reciter_id <> listener_id)
);
create index mushaf_sessions_reciter_idx  on public.mushaf_sessions(reciter_id, state);
create index mushaf_sessions_listener_idx on public.mushaf_sessions(listener_id, state);

create table public.session_allowed_transitions (
  from_state text not null,
  to_state   text not null,
  primary key (from_state, to_state)
);
insert into public.session_allowed_transitions (from_state, to_state) values
  ('draft', 'awaiting_reciter_approval'),
  ('draft', 'accepted'),                        -- auto-accept path
  ('awaiting_reciter_approval', 'accepted'),
  ('awaiting_reciter_approval', 'rejected');

create or replace function public.guard_session_update() returns trigger
language plpgsql as
$$
begin
  if new.reciter_id is distinct from old.reciter_id
     or new.listener_id is distinct from old.listener_id then
    raise exception 'session: participants can never change';
  end if;
  if new.state is distinct from old.state and not exists (
    select 1 from public.session_allowed_transitions
    where from_state = old.state and to_state = new.state
  ) then
    raise exception 'session: invalid state transition % -> %', old.state, new.state;
  end if;
  return new;
end;
$$;

create trigger mushaf_sessions_guard
  before update on public.mushaf_sessions
  for each row execute function public.guard_session_update();

-- ============ word errors (independent, deletable rows) ============
create table public.mushaf_errors (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid references public.mushaf_sessions(id) on delete cascade,  -- NULL = self-mark
  reciter_id     uuid not null references public.users(id) on delete cascade,
  marker_id      uuid not null references public.users(id),
  location       text not null references public.quran_words(location),
  letter_indexes smallint[],          -- NULL = whole word; else cluster positions in text_uthmani
  error_type_id  smallint not null references public.error_types(id),
  subtype_id     smallint,
  created_at     timestamptz not null default now(),
  foreign key (error_type_id, subtype_id) references public.error_subtypes(error_type_id, id),
  check (session_id is not null or marker_id = reciter_id),
  check (letter_indexes is null or array_length(letter_indexes, 1) >= 1)
);
create index mushaf_errors_session_idx      on public.mushaf_errors(session_id);
create index mushaf_errors_reciter_stat_idx on public.mushaf_errors(reciter_id, location, error_type_id);

create or replace function public.guard_error_insert() returns trigger
language plpgsql security definer set search_path = public as
$$
declare
  s public.mushaf_sessions%rowtype;
begin
  -- Bismillah is not markable (incl. al-Fatihah 1:1)
  if new.location like '1:1:%' then
    raise exception 'bismillah is not markable';
  end if;
  if new.session_id is not null then
    select * into s from public.mushaf_sessions where id = new.session_id;
    if not found then
      raise exception 'session not found';
    end if;
    if s.state <> 'draft' then
      raise exception 'errors can only be added while the session is draft';
    end if;
    if new.marker_id is distinct from s.listener_id
       or new.reciter_id is distinct from s.reciter_id then
      raise exception 'error does not match the session participants';
    end if;
  end if;
  return new;
end;
$$;

create trigger mushaf_errors_guard_insert
  before insert on public.mushaf_errors
  for each row execute function public.guard_error_insert();

-- ============ auto-accept list (reciter trusts listener) ============
create table public.auto_accept_list (
  reciter_id  uuid not null references public.users(id) on delete cascade,
  listener_id uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (reciter_id, listener_id),
  check (reciter_id <> listener_id)
);

-- ============ addressing: find a reciter by public code (no email enumeration) ============
create or replace function public.lookup_user_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = public as
$$
declare
  v_id uuid;
begin
  select id into v_id from public.users where user_code = btrim(p_code);
  return v_id;
end;
$$;

-- ============ session flow (security-definer, fully validated) ============
create or replace function public.send_session(p_session_id uuid) returns text
language plpgsql security definer set search_path = public as
$$
declare
  s      public.mushaf_sessions%rowtype;
  v_me   uuid := public.current_profile_id();
  v_state text;
begin
  select * into s from public.mushaf_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session not found';
  end if;
  if s.listener_id is distinct from v_me then
    raise exception 'only the listener can send this session';
  end if;
  if s.state <> 'draft' then
    raise exception 'session was already sent';
  end if;
  if not exists (select 1 from public.mushaf_errors where session_id = s.id) then
    raise exception 'cannot send a session with no marks';
  end if;

  if exists (select 1 from public.auto_accept_list a
             where a.reciter_id = s.reciter_id and a.listener_id = s.listener_id) then
    v_state := 'accepted';
    update public.mushaf_sessions
    set state = 'accepted', sent_at = now(), responded_at = now()
    where id = s.id;
    perform public.notify(s.reciter_id, 'session_auto_accepted',
      jsonb_build_object('session_id', s.id));
  else
    v_state := 'awaiting_reciter_approval';
    update public.mushaf_sessions
    set state = 'awaiting_reciter_approval', sent_at = now()
    where id = s.id;
    perform public.notify(s.reciter_id, 'session_received',
      jsonb_build_object('session_id', s.id));
  end if;
  return v_state;
end;
$$;

create or replace function public.respond_to_session(p_session_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as
$$
declare
  s    public.mushaf_sessions%rowtype;
  v_me uuid := public.current_profile_id();
  v_state text;
begin
  select * into s from public.mushaf_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session not found';
  end if;
  if s.reciter_id is distinct from v_me then
    raise exception 'only the reciter can respond to this session';
  end if;
  if s.state <> 'awaiting_reciter_approval' then
    raise exception 'session is not awaiting your approval';
  end if;

  v_state := case when p_accept then 'accepted' else 'rejected' end;
  update public.mushaf_sessions
  set state = v_state, responded_at = now()
  where id = s.id;
  perform public.notify(s.listener_id, 'session_response',
    jsonb_build_object('session_id', s.id, 'accepted', p_accept));
  return v_state;
end;
$$;
