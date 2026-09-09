-- 0102_campus_session_helpers.sql
--
-- OWNER: Mammu.
--
-- Session helpers built on the tables as they already are: app_users links to
-- a login through auth_user_id.
--
-- A posting needs somewhere to live. user_roles has scope_type and scope_id,
-- but a CHECK constraint restricts scope_type to the values the identity
-- subsystem uses, and widening somebody else's constraint by guesswork risks
-- dropping a value this file cannot see. A dedicated nullable column is purely
-- additive and cannot break anything already there.
--
-- Every function here is SECURITY DEFINER on purpose. Policies on app_users
-- and user_roles have to read those same tables, and an invoker-rights
-- function would recurse. None of them exposes anything beyond the caller's
-- own tenant, role and posting.

-- Where a guard or librarian is posted. Null for every other role.
alter table public.user_roles
  add column if not exists location_id uuid;

do $fk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_roles_location_id_fkey'
  ) then
    alter table public.user_roles
      add constraint user_roles_location_id_fkey
      foreign key (location_id) references public.campus_locations (id) on delete set null;
  end if;
end
$fk$;

create index if not exists user_roles_location_idx
  on public.user_roles (location_id);

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select id
  from public.app_users
  where auth_user_id = auth.uid() and status = 'active'
  limit 1;
$fn$;

create or replace function public.current_university_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select university_id
  from public.app_users
  where auth_user_id = auth.uid() and status = 'active'
  limit 1;
$fn$;

-- Highest-privilege role held, so a multi-role account resolves the same way
-- everywhere instead of depending on row order.
create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select r.role
  from public.user_roles r
  join public.app_users u on u.id = r.user_id
  where u.auth_user_id = auth.uid() and u.status = 'active'
  order by array_position(
    array[
      'platform_admin', 'university_admin', 'registrar', 'department_admin',
      'card_operator', 'revocation_officer', 'librarian', 'guard',
      'verifier', 'auditor'
    ]::public.app_role[],
    r.role
  )
  limit 1;
$fn$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.user_roles r
    join public.app_users u on u.id = r.user_id
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and r.role in ('platform_admin', 'university_admin')
  );
$fn$;

-- The gate or library this person is posted to. Null for everyone else.
create or replace function public.current_user_location_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select r.location_id
  from public.user_roles r
  join public.app_users u on u.id = r.user_id
  where u.auth_user_id = auth.uid()
    and u.status = 'active'
    and r.location_id is not null
  limit 1;
$fn$;

grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_university_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_location_id() to authenticated;
