begin;
-- Run inside a transaction that is rolled back. These are synthetic users.
insert into auth.users (id) values
  ('57ce8cff-a092-4970-942b-fcf6078f4b06'),
  ('57ce8cff-a092-4970-942b-fcf6078f4b07');

set local role service_role;
insert into public.profiles (id, full_name) values
  ('57ce8cff-a092-4970-942b-fcf6078f4b06', 'Test Innovator One'),
  ('57ce8cff-a092-4970-942b-fcf6078f4b07', 'Test Innovator Two');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"57ce8cff-a092-4970-942b-fcf6078f4b06","is_anonymous":false}',
  true
);
do $test$
begin
  if (select array_agg(full_name) from public.profiles)
     is distinct from array['Test Innovator One'] then
    raise exception 'Authenticated owner could not read exactly their own profile';
  end if;

  begin
    update public.profiles set account_status = 'active';
    raise exception 'Authenticated profile write should have been denied';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;

select set_config(
  'request.jwt.claims',
  '{"sub":"57ce8cff-a092-4970-942b-fcf6078f4b06","is_anonymous":true}',
  true
);
do $test$
begin
  if exists (select from public.profiles) then
    raise exception 'Anonymous Auth user could read a profile';
  end if;
end;
$test$;
reset role;

set local role anon;
do $test$
begin
  begin
    perform id from public.profiles;
    raise exception 'Public profile read should have been denied';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;
reset role;
rollback;
