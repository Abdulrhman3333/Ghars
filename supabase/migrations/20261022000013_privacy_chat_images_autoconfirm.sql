-- 0013 · four changes requested during the review round:
--   1. High privacy: `name`, `email`, `phone` are readable ONLY by their owner and by admins.
--      Everyone else addresses people by `user_code` (the platform convention).
--   2. Simple chat, allowed only between a learner and the teacher assigned to them.
--   3. Common-error submissions can carry an image for the correct and incorrect readings.
--   4. New signups count as confirmed immediately (no email verification round-trip).

-- ============ 1. privacy: hide name / email / phone behind column privileges ============
-- Table-level SELECT is replaced by a column list that excludes the private fields.
-- Definer functions and admins (through v_users_admin below) keep full access.
revoke select on public.users from authenticated;
grant select (id, auth_user_id, user_code, preferred_contact, age_range, register_date, created_at, updated_at)
  on public.users to authenticated;

-- the signed-in user's own full profile (name/email/phone included): self only
create or replace function public.my_profile() returns jsonb
language sql stable security definer set search_path = public as
$$
  select to_jsonb(u) from public.users u where u.auth_user_id = auth.uid()
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- admins read names/emails through this definer view (blocked for non-admins inside the view itself)
create or replace view public.v_users_admin as
select id, auth_user_id, user_code, name, email, phone, preferred_contact, age_range,
       register_date, created_at, updated_at
from public.users
where public.is_admin();

revoke select on public.v_users_admin from anon;
grant select on public.v_users_admin to authenticated;

-- lineage tree shows names (certifier → student) only when the caller is an admin
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
  select t.user_id,
         case when public.is_admin() then u.name end as name,
         u.user_code,
         t.certifier_id, t.juz_number, t.depth, t.completed_at
  from tree t
  join public.users u on u.id = t.user_id
  order by t.depth, t.completed_at;
end;
$$;

-- ============ 2. chat between an assigned learner and their teacher ============
create table public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.users(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
alter table public.chat_messages enable row level security;
create index chat_messages_pair_idx
  on public.chat_messages (greatest(sender_id, recipient_id), least(sender_id, recipient_id), created_at desc);
create index chat_messages_recipient_unread_idx on public.chat_messages (recipient_id) where read_at is null;

-- the link comes from progress: teacher on my row, or me on theirs (any state — they are still paired)
create or replace function public.can_chat_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.progress pr
    where (pr.student_id = public.current_profile_id() and pr.teacher_id = p_user)
       or (pr.teacher_id = public.current_profile_id() and pr.student_id = p_user)
  );
$$;
revoke execute on function public.can_chat_with(uuid) from public, anon;
grant execute on function public.can_chat_with(uuid) to authenticated;

create policy chat_select_own on public.chat_messages
  for select to authenticated
  using (sender_id = public.current_profile_id() or recipient_id = public.current_profile_id());

create policy chat_insert_linked on public.chat_messages
  for insert to authenticated
  with check (sender_id = public.current_profile_id() and public.can_chat_with(recipient_id));

create policy chat_update_read on public.chat_messages
  for update to authenticated
  using (recipient_id = public.current_profile_id() and read_at is null)
  with check (recipient_id = public.current_profile_id());

-- only the reading receipt may change, and only once
create or replace function public.guard_chat_update() returns trigger
language plpgsql as
$$
begin
  if new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at
     or (new.read_at is not null and old.read_at is not null) then
    raise exception 'chat: only read_at can change, and only once';
  end if;
  return new;
end;
$$;
create trigger chat_messages_guard
  before update on public.chat_messages
  for each row execute function public.guard_chat_update();

-- a new message drops an in-app notification on the recipient
create or replace function public.chat_notify() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  perform public.notify(new.recipient_id, 'chat_message',
    jsonb_build_object('message_id', new.id, 'sender_id', new.sender_id));
  return new;
end;
$$;
create trigger chat_notify
  after insert on public.chat_messages
  for each row execute function public.chat_notify();

-- ============ 3. common-error images ============
alter table public.common_errors
  add column correct_image_path   text,
  add column incorrect_image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('error-images', 'error-images', false, 5242880,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy images_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'error-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy images_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'error-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (select 1 from public.common_errors ce
                 where ce.state = 'approved'
                   and (ce.correct_image_path = storage.objects.name
                        or ce.incorrect_image_path = storage.objects.name))
      or exists (select 1 from public.common_errors ce
                 where ce.submitted_by = public.current_profile_id()
                   and (ce.correct_image_path = storage.objects.name
                        or ce.incorrect_image_path = storage.objects.name))
    )
  );

create policy images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'error-images'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ============ 4. no email verification: signups are confirmed at creation ============
create or replace function public.auto_confirm_signup() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  if new.email_confirmed_at is null and new.is_anonymous = false then
    new.email_confirmed_at := now();
    new.confirmation_token := '';
  end if;
  return new;
end;
$$;
create trigger on_auth_user_autoconfirm
  before insert on auth.users
  for each row execute function public.auto_confirm_signup();
