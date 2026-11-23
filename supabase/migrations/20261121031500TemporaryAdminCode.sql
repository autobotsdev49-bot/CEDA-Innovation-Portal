-- Temporary hackathon path. The permanent AAL2 protected invitation function remains unchanged.
create or replace function ceda_private.admin_prepare_invitation_temporary(address text, display_name text, new_role text, lead boolean, sectors uuid[], reason text, admin_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := ceda_private.require_admin(false); invitation uuid; previous public.staff_invitations;
begin
  if now() >= '2026-11-23 00:00:00 Africa/Gaborone'::timestamptz
    or admin_code is distinct from '230701'
    or not exists(select 1 from auth.users where id=actor and lower(email)='autobotsdev49@gmail.com')
  then raise exception 'Temporary administrator verification failed' using errcode='42501'; end if;
  if address is null or length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or display_name is null or length(btrim(display_name)) not between 1 and 120
    or display_name ~ '[[:cntrl:]<>]' or new_role is null or new_role not in ('innovator','admin','assessor','support')
    or lead is null or (lead and new_role<>'assessor') or sectors is null
    or reason is null or length(btrim(reason)) not between 5 and 500 then raise exception 'Invalid invitation'; end if;
  if exists(select 1 from unnest(sectors) x where not exists(select 1 from public.sectors s where s.id=x and s.status<>'archived')) then raise exception 'Invalid sector scope'; end if;
  select * into previous from public.staff_invitations where email=lower(btrim(address)) for update;
  if found then
    if previous.created_by=actor and previous.consumed_at is null and previous.expires_at>now()
      and previous.full_name=btrim(display_name) and previous.account_role=new_role
      and previous.lead_assessor=lead and previous.sector_ids=sectors then return previous.id; end if;
    raise exception 'Invitation already exists. Review its status before changing access.';
  end if;
  if exists(select 1 from auth.users where lower(email)=lower(btrim(address))) then raise exception 'Account already exists. Use its directory entry.'; end if;
  insert into public.staff_invitations(email,full_name,account_role,lead_assessor,sector_ids,created_by)
    values(lower(btrim(address)),btrim(display_name),new_role,lead,sectors,actor) returning id into invitation;
  insert into public.admin_audit(actor_id,action,target,detail)
    values(actor,'user.invitation.prepared',invitation::text,jsonb_build_object('role',new_role,'lead',lead,'sectors',sectors,'reason',reason,'verification','temporary_hackathon_code'));
  return invitation;
end $$;

create or replace function public.admin_prepare_invitation_temporary(address text, display_name text, new_role text, lead boolean, sectors uuid[], reason text, admin_code text)
returns uuid language sql security invoker set search_path = ''
as $$ select ceda_private.admin_prepare_invitation_temporary(address,display_name,new_role,lead,sectors,reason,admin_code) $$;
revoke all on function public.admin_prepare_invitation_temporary(text,text,text,boolean,uuid[],text,text) from public, anon;
grant execute on function public.admin_prepare_invitation_temporary(text,text,text,boolean,uuid[],text,text) to authenticated;
