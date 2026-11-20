-- Enforce account status at the data boundary.
alter policy profiles_read_own on public.profiles
  using (
    id = (select auth.uid())
    and ((select auth.jwt()) ->> 'is_anonymous') = 'false'
    and account_status = 'active'
  );

-- Normalize untrusted signup metadata before it becomes a display name.
create or replace function ceda_private.provision_confirmed_innovator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  applicant_name text;
begin
  if jsonb_typeof(new.raw_user_meta_data -> 'full_name') = 'string' then
    applicant_name := btrim(new.raw_user_meta_data ->> 'full_name');
    if char_length(applicant_name) not between 1 and 120
      or applicant_name ~ '[[:cntrl:]<>]'
      or applicant_name ~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'
    then
      applicant_name := null;
    end if;
  end if;

  insert into public.profiles (id, full_name, account_role)
  values (new.id, coalesce(applicant_name, 'Innovator'), 'innovator')
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function ceda_private.provision_confirmed_innovator()
  from public, anon, authenticated, service_role;

