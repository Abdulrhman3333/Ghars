-- 0001 · core: profile users, privileged roles (admin|examiner), notifications, shared helpers.
-- NOTE: there is deliberately NO 'teacher' role. Teacher status is derived from progress.state='passed'.

create extension if not exists pgcrypto with schema extensions;

-- ============ generic updated_at helper ============
create or replace function public.set_updated_at() returns trigger
language plpgsql as
$$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ users (profile; mirrors auth.users) ============
create table public.users (
  id                uuid primary key default gen_random_uuid(),
  auth_user_id      uuid not null unique references auth.users(id) on delete cascade,
  user_code         text not null unique,              -- short public code, assigned by trigger
  name              text not null check (char_length(btrim(name)) between 2 and 100),
  email             text not null,
  phone             text,
  preferred_contact text not null default 'other'
                    check (preferred_contact in ('telegram','whatsapp','zoom','google_meet','other')),
  age_range         text not null
                    check (age_range in ('under_12','12_17','18_24','25_34','35_44','45_54','55_plus')),
  register_date     timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- 6-digit unique public code (UI renders it with Arabic-Indic digits)
create or replace function public.assign_user_code() returns trigger
language plpgsql security definer set search_path = public as
$$
declare
  candidate text;
begin
  if new.user_code is not null and btrim(new.user_code) <> '' then
    return new;
  end if;
  loop
    candidate := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.users where user_code = candidate);
  end loop;
  new.user_code := candidate;
  return new;
end;
$$;

create trigger users_assign_user_code
  before insert on public.users
  for each row execute function public.assign_user_code();

-- profile fields that may never change after creation (email changes go through auth)
create or replace function public.guard_users_immutable() returns trigger
language plpgsql as
$$
begin
  if new.id is distinct from old.id
     or new.auth_user_id is distinct from old.auth_user_id
     or new.user_code is distinct from old.user_code
     or new.email is distinct from old.email
     or new.register_date is distinct from old.register_date then
    raise exception 'users: immutable profile field';
  end if;
  return new;
end;
$$;

create trigger users_guard_immutable
  before update on public.users
  for each row execute function public.guard_users_immutable();

-- auth signup → profile row (metadata comes from the registration form)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  insert into public.users (auth_user_id, name, email, phone, preferred_contact, age_range)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    case when new.raw_user_meta_data ->> 'preferred_contact'
              in ('telegram','whatsapp','zoom','google_meet','other')
         then new.raw_user_meta_data ->> 'preferred_contact' else 'other' end,
    case when new.raw_user_meta_data ->> 'age_range'
              in ('under_12','12_17','18_24','25_34','35_44','45_54','55_plus')
         then new.raw_user_meta_data ->> 'age_range' else '18_24' end
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ privileged roles ============
create table public.user_roles (
  user_id    uuid not null references public.users(id) on delete cascade,
  role       text not null check (role in ('admin','examiner')),
  granted_by uuid references public.users(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ============ identity / role helpers (RLS-friendly, RLS-bypassing by ownership) ============
create or replace function public.current_profile_id() returns uuid
language sql stable security definer set search_path = public as
$$
  select id from public.users where auth_user_id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.user_roles
    where user_id = public.current_profile_id() and role = 'admin'
  )
$$;

create or replace function public.is_examiner() returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.user_roles
    where user_id = public.current_profile_id() and role = 'examiner'
  )
$$;

-- bootstrap: the FIRST admin can self-grant; afterwards only admins may grant roles
create or replace function public.grant_role_by_email(p_email text, p_role text) returns void
language plpgsql security definer set search_path = public as
$$
declare
  v_target uuid;
begin
  if p_role not in ('admin','examiner') then
    raise exception 'unknown role %', p_role;
  end if;
  if exists (select 1 from public.user_roles where role = 'admin')
     and not public.is_admin() then
    raise exception 'only an admin can grant roles';
  end if;
  select id into v_target from public.users where email = p_email;
  if v_target is null then
    raise exception 'no user with email %', p_email;
  end if;
  insert into public.user_roles (user_id, role, granted_by)
  values (v_target, p_role, public.current_profile_id())
  on conflict (user_id, role) do nothing;
end;
$$;

-- ============ notifications (in-app; email is layered on later) ============
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  kind       text not null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications(user_id) where read_at is null;

create or replace function public.notify(p_user uuid, p_kind text, p_payload jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public as
$$
begin
  insert into public.notifications (user_id, kind, payload) values (p_user, p_kind, p_payload);
end;
$$;
