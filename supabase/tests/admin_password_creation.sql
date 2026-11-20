-- Rollback-only check of the same confirmed-insert trigger path used by Auth Admin creation.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data)
values ('b3000000-0000-4000-8000-000000000001','password-create-admin@example.invalid',now(),false,'{"full_name":"Synthetic Admin"}');
update public.profiles set account_role='admin' where id='b3000000-0000-4000-8000-000000000001';
insert into auth.sessions(id,user_id) values ('b4000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000001","session_id":"b4000000-0000-4000-8000-000000000001","is_anonymous":false,"aal":"aal2"}',true);
select public.admin_prepare_invitation('password-create-staff@example.invalid','Synthetic Staff','support',false,'{}','Test password account creation');
reset role;
insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data)
values ('b3000000-0000-4000-8000-000000000002','password-create-staff@example.invalid',now(),false,'{"full_name":"Synthetic Staff"}');
do $$ begin
  if not exists(select 1 from public.profiles where id='b3000000-0000-4000-8000-000000000002' and full_name='Synthetic Staff' and account_role='support' and account_status='active') then raise exception 'Confirmed creation did not apply trusted access'; end if;
  if not exists(select 1 from public.staff_invitations where email='password-create-staff@example.invalid' and consumed_at is not null) then raise exception 'Reservation was not consumed'; end if;
  if (select count(*) from public.admin_audit where actor_id='b3000000-0000-4000-8000-000000000001')<>2 then raise exception 'Expected preparation and activation audit'; end if;
end $$;
select 'confirmed account and trusted role activation passed' as result;
rollback;
