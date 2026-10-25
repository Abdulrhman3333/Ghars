-- Registration no longer collects a display name. Keep the required profile
-- column valid by using the email local-part only when it satisfies the
-- existing profile constraint.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as
$$
declare
  email_name text := btrim(split_part(new.email, '@', 1));
begin
  insert into public.users (auth_user_id, name, email, phone, preferred_contact, age_range)
  values (
    new.id,
    case
      when char_length(email_name) between 2 and 100 then email_name
      else 'مستخدم غرس'
    end,
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
