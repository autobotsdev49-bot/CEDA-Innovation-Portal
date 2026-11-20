-- Expose invoker wrappers and keep privileged implementations in the private schema.
alter function public.admin_directory(text,integer) set schema ceda_private;
alter function public.admin_sectors() set schema ceda_private;
alter function public.admin_save_sector(text,text,text,uuid) set schema ceda_private;
alter function public.admin_assign_role(uuid,text,boolean,uuid[],text) set schema ceda_private;
alter function public.admin_prepare_invitation(text,text,text,boolean,uuid[],text) set schema ceda_private;

grant usage on schema ceda_private to authenticated;

create function public.admin_directory(search_text text default '', page_number integer default 0)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_directory(search_text,page_number) $$;
create function public.admin_sectors()
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_sectors() $$;
create function public.admin_save_sector(sector_name text, sector_status text, reason text, sector_id uuid default null)
returns uuid language sql security invoker set search_path = ''
as $$ select ceda_private.admin_save_sector(sector_name,sector_status,reason,sector_id) $$;
create function public.admin_assign_role(target_id uuid, new_role text, lead boolean, sectors uuid[], reason text)
returns void language sql security invoker set search_path = ''
as $$ select ceda_private.admin_assign_role(target_id,new_role,lead,sectors,reason) $$;
create function public.admin_prepare_invitation(address text, display_name text, new_role text, lead boolean, sectors uuid[], reason text)
returns uuid language sql security invoker set search_path = ''
as $$ select ceda_private.admin_prepare_invitation(address,display_name,new_role,lead,sectors,reason) $$;
revoke all on function public.admin_directory(text,integer), public.admin_sectors(),
  public.admin_save_sector(text,text,text,uuid), public.admin_assign_role(uuid,text,boolean,uuid[],text),
  public.admin_prepare_invitation(text,text,text,boolean,uuid[],text) from public, anon;
grant execute on function public.admin_directory(text,integer), public.admin_sectors(),
  public.admin_save_sector(text,text,text,uuid), public.admin_assign_role(uuid,text,boolean,uuid[],text),
  public.admin_prepare_invitation(text,text,text,boolean,uuid[],text) to authenticated;

create policy sectors_direct_access_denied on public.sectors as restrictive for all to public using(false) with check(false);
create policy staff_sectors_direct_access_denied on public.staff_sectors as restrictive for all to public using(false) with check(false);
create policy invitations_direct_access_denied on public.staff_invitations as restrictive for all to public using(false) with check(false);
create policy audit_direct_access_denied on public.admin_audit as restrictive for all to public using(false) with check(false);
