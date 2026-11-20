-- Roles are assigned by trusted server operations. Public signup still creates Innovators.
alter table public.profiles drop constraint profiles_public_role;
alter table public.profiles add constraint profiles_public_role
  check (account_role in ('innovator', 'admin'));
