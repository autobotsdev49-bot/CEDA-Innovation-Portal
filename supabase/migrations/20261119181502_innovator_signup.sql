alter table public.profiles
  add column account_role text not null default 'innovator',
  add constraint profiles_public_role check (account_role = 'innovator');

create schema ceda_private;
revoke all on schema ceda_private from public, anon, authenticated;

-- Auth owns email verification. Only a confirmed email account gets a profile.
create function ceda_private.provision_confirmed_innovator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  applicant_name text;
begin
  if jsonb_typeof(new.raw_user_meta_data -> 'full_name') = 'string' then
    applicant_name := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  end if;

  insert into public.profiles (id, full_name, account_role)
  values (new.id, coalesce(left(applicant_name, 120), 'Innovator'), 'innovator')
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function ceda_private.provision_confirmed_innovator()
  from public, anon, authenticated, service_role;

create trigger ceda_provision_confirmed_innovator
after insert or update of email_confirmed_at on auth.users
for each row
when (new.email_confirmed_at is not null and new.email is not null and not new.is_anonymous)
execute function ceda_private.provision_confirmed_innovator();

-- The Supabase event trigger remains installed. Close its client-facing execute grants.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
