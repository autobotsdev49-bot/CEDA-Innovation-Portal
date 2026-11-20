-- Run through the migration ledger after review.
alter table public.profiles drop constraint profiles_public_role;
alter table public.profiles add constraint profiles_public_role
  check (account_role in ('innovator','admin','assessor','support'));
alter table public.profiles add column lead_assessor boolean not null default false;
alter table public.profiles add constraint profiles_lead_role check (not lead_assessor or account_role = 'assessor');

create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 2 and 100),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now()
);
create table public.staff_sectors (
  user_id uuid not null references public.profiles(id),
  sector_id uuid not null references public.sectors(id),
  primary key(user_id, sector_id)
);
create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  action text not null,
  target text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  account_role text not null check (account_role in ('innovator','admin','assessor','support')),
  lead_assessor boolean not null default false,
  sector_ids uuid[] not null default '{}',
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '24 hours',
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (not lead_assessor or account_role = 'assessor')
);
alter table public.sectors enable row level security;
alter table public.staff_sectors enable row level security;
alter table public.admin_audit enable row level security;
alter table public.staff_invitations enable row level security;
revoke all on public.sectors, public.staff_sectors, public.admin_audit, public.staff_invitations from public, anon, authenticated;

create function ceda_private.require_admin(strong boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=actor and p.account_role='admin' and p.account_status='active'
      and u.email_confirmed_at is not null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until < now())
  ) or not exists (
    select 1 from auth.sessions s where s.user_id=actor
      and s.id::text = (auth.jwt()->>'session_id')
      and (s.not_after is null or s.not_after > now())
  ) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if strong and (auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception 'Multi-factor verification required' using errcode='42501';
  end if;
  return actor;
end $$;
revoke all on function ceda_private.require_admin(boolean) from public, anon, authenticated;

create function public.admin_directory(search_text text default '', page_number integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform ceda_private.require_admin();
  if length(search_text)>100 or page_number not between 0 and 10000 then raise exception 'Invalid filter'; end if;
  return coalesce((select jsonb_agg(row_to_json(r)) from (
    select p.id,p.full_name,u.email,p.account_role,p.account_status,p.lead_assessor,
      coalesce((select array_agg(s.sector_id) from public.staff_sectors s where s.user_id=p.id),'{}') as sector_ids
    from public.profiles p join auth.users u on u.id=p.id
    where p.full_name ilike '%'||search_text||'%' or u.email ilike '%'||search_text||'%'
    order by p.created_at desc,p.id limit 25 offset page_number*25
  ) r),'[]'::jsonb);
end $$;

create function public.admin_sectors()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform ceda_private.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.name) from public.sectors s),'[]'::jsonb);
end $$;

create function public.admin_save_sector(sector_name text, sector_status text, reason text, sector_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := ceda_private.require_admin(); saved uuid; previous jsonb;
begin
  if reason is null or length(btrim(reason)) not between 5 and 500
    or sector_name is null or length(btrim(sector_name)) not between 2 and 100
    or sector_status is null or sector_status not in ('draft','published','archived') then raise exception 'Invalid sector or reason'; end if;
  if sector_id is null then
    insert into public.sectors(name,status) values(btrim(sector_name),sector_status) returning id into saved;
  else
    select to_jsonb(s) into previous from public.sectors s where id=sector_id for update;
    if previous is null then raise exception 'Sector unavailable'; end if;
    update public.sectors set name=btrim(sector_name),status=sector_status where id=sector_id returning id into saved;
  end if;
  insert into public.admin_audit(actor_id,action,target,detail)
    values(actor,'sector.saved',saved::text,jsonb_build_object('before',previous,'name',btrim(sector_name),'status',sector_status,'reason',reason));
  return saved;
end $$;

create function public.admin_assign_role(target_id uuid, new_role text, lead boolean, sectors uuid[], reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := ceda_private.require_admin(true); previous jsonb;
begin
  if new_role is null or new_role not in ('innovator','admin','assessor','support')
    or lead is null or (lead and new_role<>'assessor') or sectors is null or
    reason is null or length(btrim(reason)) not between 5 and 500 then raise exception 'Invalid role or reason'; end if;
  if new_role='assessor' and cardinality(sectors)=0 then raise exception 'Assessor needs sector scope'; end if;
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

create function public.admin_prepare_invitation(address text, display_name text, new_role text, lead boolean, sectors uuid[], reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := ceda_private.require_admin(true); invitation uuid; previous public.staff_invitations;
begin
  if address is null or length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or display_name is null or length(btrim(display_name)) not between 1 and 120
    or display_name ~ '[[:cntrl:]<>]' or new_role is null or new_role not in ('innovator','admin','assessor','support')
    or lead is null or (lead and new_role<>'assessor') or sectors is null
    or reason is null or length(btrim(reason)) not between 5 and 500 then raise exception 'Invalid invitation'; end if;
  if new_role='assessor' and cardinality(sectors)=0 then raise exception 'Assessor needs sector scope'; end if;
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

-- Apply only trusted, unexpired invitations when the email identity is confirmed.
create function ceda_private.apply_staff_invitation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare invited public.staff_invitations;
begin
  select * into invited from public.staff_invitations
    where email=lower(new.email) and consumed_at is null and expires_at>now() for update;
  if not found then return new; end if;
  if not exists(select 1 from public.profiles p where p.id=invited.created_by and p.account_role='admin' and p.account_status='active') then
    raise exception 'Inviting administrator no longer authorized';
  end if;
  if exists(select 1 from unnest(invited.sector_ids) x where not exists(select 1 from public.sectors s where s.id=x and s.status<>'archived')) then
    raise exception 'Invitation sector no longer available';
  end if;
  update public.profiles set full_name=invited.full_name,account_role=invited.account_role,
    lead_assessor=invited.lead_assessor,updated_at=now() where id=new.id;
  if not found then raise exception 'Confirmed profile missing'; end if;
  insert into public.staff_sectors select new.id,x from (select distinct unnest(invited.sector_ids) x) scopes on conflict do nothing;
  update public.staff_invitations set consumed_at=now() where id=invited.id;
  insert into public.admin_audit(actor_id,action,target,detail)
    values(invited.created_by,'user.invitation.accepted',new.id::text,jsonb_build_object('invitation',invited.id,'role',invited.account_role));
  return new;
end $$;
create trigger ceda_staff_invitation
after insert or update of email_confirmed_at on auth.users
for each row when (new.email_confirmed_at is not null and new.email is not null and not new.is_anonymous)
execute function ceda_private.apply_staff_invitation();
revoke all on function ceda_private.apply_staff_invitation() from public, anon, authenticated;

revoke all on function public.admin_directory(text,integer), public.admin_sectors(),
  public.admin_save_sector(text,text,text,uuid), public.admin_assign_role(uuid,text,boolean,uuid[],text),
  public.admin_prepare_invitation(text,text,text,boolean,uuid[],text)
  from public, anon;
grant execute on function public.admin_directory(text,integer), public.admin_sectors(),
  public.admin_save_sector(text,text,text,uuid), public.admin_assign_role(uuid,text,boolean,uuid[],text),
  public.admin_prepare_invitation(text,text,text,boolean,uuid[],text) to authenticated;
