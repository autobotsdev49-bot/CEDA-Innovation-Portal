create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  account_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(btrim(full_name)) between 1 and 120),
  constraint profiles_account_status_valid check (account_status in ('active', 'suspended', 'closed'))
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from public, anon, authenticated, service_role;
grant select on table public.profiles to authenticated;
grant select, insert, update on table public.profiles to service_role;

create policy profiles_read_own on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    and ((select auth.jwt()) ->> 'is_anonymous') = 'false'
  );
