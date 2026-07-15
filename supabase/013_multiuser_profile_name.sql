-- Multi-user: the new-user trigger previously defaulted every profile name to
-- 'Vishal'. Default to the signup name, then the email's local part, then a
-- neutral 'there' — so new users aren't all named Vishal.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'there'
    )
  );
  return new;
end;
$$;
