begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values
 ('b1000000-0000-4000-8000-000000000001','admin-test@example.invalid',now(),false,'{"full_name":"Synthetic Admin"}'),
 ('b1000000-0000-4000-8000-000000000002','owner-test@example.invalid',now(),false,'{"full_name":"Synthetic Owner"}');
update public.profiles set account_role='admin' where id='b1000000-0000-4000-8000-000000000001';
insert into auth.sessions(id,user_id) values
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001'),
 ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002","is_anonymous":false,"aal":"aal2"}',true);
do $$
begin
  begin
    perform public.admin_directory();
    raise exception 'Innovator gained admin access';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set account_role='admin' where id='b1000000-0000-4000-8000-000000000002';
    raise exception 'Client could update its role';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","session_id":"b2000000-0000-4000-8000-000000000001","is_anonymous":false,"aal":"aal1"}',true);
do $$
begin
  if jsonb_array_length(public.admin_directory('Synthetic'))<>2 then raise exception 'Directory mismatch'; end if;
  begin
    perform public.admin_assign_role('b1000000-0000-4000-8000-000000000002','support',false,'{}','Test assignment');
    raise exception 'Role change skipped MFA';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","session_id":"b2000000-0000-4000-8000-000000000001","is_anonymous":false,"aal":"aal2"}',true);
do $$
declare sector uuid;
begin
  sector := public.admin_save_sector('Synthetic Sector','published','Test sector');
  perform public.admin_assign_role('b1000000-0000-4000-8000-000000000002','assessor',true,array[sector],'Test lead assignment');
  perform public.admin_prepare_invitation('invited-test@example.invalid','Invited Synthetic','support',false,'{}','Test invitation');
end $$;
reset role;
insert into auth.users(id,email,is_anonymous,raw_user_meta_data)
 values('b1000000-0000-4000-8000-000000000003','invited-test@example.invalid',false,'{"account_role":"admin"}');
do $$ begin
  if exists(select 1 from public.profiles where id='b1000000-0000-4000-8000-000000000003') then raise exception 'Pending user gained a profile'; end if;
end $$;
update auth.users set email_confirmed_at=now() where id='b1000000-0000-4000-8000-000000000003';
do $$ begin
  if not exists(select 1 from public.profiles where id='b1000000-0000-4000-8000-000000000002' and account_role='assessor' and lead_assessor) then raise exception 'Lead role missing'; end if;
  if not exists(select 1 from public.profiles where id='b1000000-0000-4000-8000-000000000003' and account_role='support') then raise exception 'Trusted invitation not applied'; end if;
  if (select count(*) from public.admin_audit where actor_id='b1000000-0000-4000-8000-000000000001')<>4 then raise exception 'Audit events missing'; end if;
end $$;
delete from auth.sessions where id='b2000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  begin
    perform public.admin_directory();
    raise exception 'Revoked session retained access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
