begin;
-- Run in a transaction and roll back. Values are test fixtures only.
insert into auth.users (id, email, raw_user_meta_data)
values ('71dbea30-d3b5-4a2c-bceb-dda565c142ee', 'ceda-signup-test@example.invalid',
        '{"full_name":" Test Innovator ","account_role":"admin","account_status":"suspended"}');

do $$
begin
  if exists (select from public.profiles where id = '71dbea30-d3b5-4a2c-bceb-dda565c142ee') then
    raise exception 'An unverified account received a profile';
  end if;
end;
$$;

update auth.users set email_confirmed_at = now()
where id = '71dbea30-d3b5-4a2c-bceb-dda565c142ee';

do $$
begin
  if not exists (
    select from public.profiles where id = '71dbea30-d3b5-4a2c-bceb-dda565c142ee'
      and full_name = 'Test Innovator' and account_role = 'innovator' and account_status = 'active'
  ) then
    raise exception 'Verified account was not provisioned with the Innovator defaults';
  end if;
end;
$$;

update public.profiles set account_status = 'suspended'
where id = '71dbea30-d3b5-4a2c-bceb-dda565c142ee';
update auth.users set email_confirmed_at = now()
where id = '71dbea30-d3b5-4a2c-bceb-dda565c142ee';

do $$
begin
  if not exists (
    select from public.profiles where id = '71dbea30-d3b5-4a2c-bceb-dda565c142ee'
      and account_status = 'suspended'
  ) then
    raise exception 'Repeated verification reset portal account status';
  end if;
  if has_function_privilege('anon', to_regprocedure('public.rls_auto_enable()'), 'execute')
    or has_function_privilege('authenticated', to_regprocedure('public.rls_auto_enable()'), 'execute') then
    raise exception 'Client roles retain execute access to the RLS event helper';
  end if;
end;
$$;
rollback;
