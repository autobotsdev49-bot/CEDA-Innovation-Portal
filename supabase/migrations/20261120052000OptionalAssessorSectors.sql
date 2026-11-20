-- A role grants access to the assessor workspace; sectors are optional assignments.
create or replace function ceda_private.admin_assign_role(target_id uuid, new_role text, lead boolean, sectors uuid[], reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := ceda_private.require_admin(true); previous jsonb;
begin
  if new_role is null or new_role not in ('innovator','admin','assessor','support')
    or lead is null or (lead and new_role<>'assessor') or sectors is null or
    reason is null or length(btrim(reason)) not between 5 and 500 then raise exception 'Invalid role or reason'; end if;
  if exists(select 1 from unnest(sectors) x where not exists(select 1 from public.sectors s where s.id=x and s.status<>'archived')) then raise exception 'Invalid sector scope'; end if;
  lock table public.profiles in share row exclusive mode;
  select to_jsonb(p) into previous from public.profiles p where id=target_id;
  if previous is null then raise exception 'User unavailable'; end if;
  if actor=target_id then raise exception 'Another administrator must change your permissions'; end if;
  if previous->>'account_role'='admin' and previous->>'account_status'='active' and new_role<>'admin'
    and (select count(*) from public.profiles where account_role='admin' and account_status='active')<=1 then
    raise exception 'Preserve the final active administrator';
  end if;
  update public.profiles set account_role=new_role,lead_assessor=lead,updated_at=now() where id=target_id;
  delete from public.staff_sectors where user_id=target_id;
  insert into public.staff_sectors select target_id,x from (select distinct unnest(sectors) x) scopes;
  insert into public.admin_audit(actor_id,action,target,detail)
    values(actor,'user.role.changed',target_id::text,jsonb_build_object('before',previous,'role',new_role,'lead',lead,'sectors',sectors,'reason',reason));
end $$;

create or replace function ceda_private.admin_prepare_invitation(address text, display_name text, new_role text, lead boolean, sectors uuid[], reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := ceda_private.require_admin(true); invitation uuid; previous public.staff_invitations;
begin
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
      and previous.lead_assessor=lead and previous.sector_ids=sectors then
      return previous.id;
    end if;
    raise exception 'Invitation already exists. Review its status before changing access.';
  end if;
  if exists(select 1 from auth.users where lower(email)=lower(btrim(address))) then raise exception 'Account already exists. Use its directory entry.'; end if;
  insert into public.staff_invitations(email,full_name,account_role,lead_assessor,sector_ids,created_by)
    values(lower(btrim(address)),btrim(display_name),new_role,lead,sectors,actor) returning id into invitation;
  insert into public.admin_audit(actor_id,action,target,detail)
    values(actor,'user.invitation.prepared',invitation::text,jsonb_build_object('role',new_role,'lead',lead,'sectors',sectors,'reason',reason));
  return invitation;
end $$;
