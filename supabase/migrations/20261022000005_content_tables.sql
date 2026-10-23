-- 0005 · common errors, learning resources, teacher invites, storage buckets.

-- ============ common errors (community-submitted, admin-reviewed) ============
create table public.common_error_categories (
  id      smallint generated always as identity primary key,
  name_ar text not null unique,                  -- مَدّ، غُنَّة، تَرْقِيق، تَشْكِيل، ...
  sort    smallint not null default 0
);

create table public.common_errors (
  id                   uuid primary key default gen_random_uuid(),
  category_id          smallint not null references public.common_error_categories(id),
  correct_text         text not null,
  correct_audio_path   text,                     -- storage path in bucket 'audio'
  incorrect_text       text not null,
  incorrect_audio_path text,
  notes                text,
  state                text not null default 'pending_review'
                       check (state in ('pending_review','approved','rejected')),
  submitted_by         uuid not null references public.users(id),
  reviewed_by          uuid references public.users(id),
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index common_errors_state_idx    on public.common_errors(state);
create index common_errors_category_idx on public.common_errors(category_id);

create trigger common_errors_set_updated_at
  before update on public.common_errors
  for each row execute function public.set_updated_at();

-- ============ learning resources (admin-managed) ============
create table public.resources (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  type         text not null check (type in ('youtube','pdf')),
  url          text,                             -- youtube links
  storage_path text,                             -- uploaded PDFs in bucket 'pdfs'
  category     text not null,
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  check ((type = 'youtube' and url is not null) or (type = 'pdf' and storage_path is not null))
);
create index resources_category_idx on public.resources(category);

-- ============ teacher invite links (single-use, expiring) ============
create table public.invites (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.users(id) on delete cascade,
  token      text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_by    uuid references public.users(id),
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index invites_teacher_idx on public.invites(teacher_id);

-- redeem an invite: marks it used and assigns the teacher to the student's first unpassed juz
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

  -- lowest juz the student has not passed yet
  select min(j) into v_juz
  from generate_series(1, 30) as j
  where not exists (
    select 1 from public.progress pr
    where pr.student_id = v_me and pr.juz_number = j and pr.state = 'passed'
  );

  perform set_config('ghars.cascade', 'on', true);   -- allow teacher_id assignment
  insert into public.progress (student_id, teacher_id, juz_number, state)
  values (v_me, i.teacher_id, v_juz, 'in_progress')
  on conflict (student_id, juz_number) do update
    set teacher_id = excluded.teacher_id;

  perform public.notify(i.teacher_id, 'invite_accepted',
    jsonb_build_object('student_id', v_me, 'juz_number', v_juz));
  return i.teacher_id;
end;
$$;

-- ============ storage buckets (validated by type & size at the bucket level) ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('audio', 'audio', false, 10485760,  -- 10 MB
     array['audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/ogg','audio/webm']),
  ('pdfs', 'pdfs', false, 20971520,    -- 20 MB
     array['application/pdf'])
on conflict (id) do nothing;
