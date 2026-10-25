-- Restore the Auth hooks required for profile creation and automatic sign-in.
-- This is safe on projects where the hooks already exist.
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

drop trigger if exists on_auth_user_autoconfirm on auth.users;
create trigger on_auth_user_autoconfirm
  before insert on auth.users
  for each row execute function public.auto_confirm_signup();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
