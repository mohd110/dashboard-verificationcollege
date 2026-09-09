-- 0102_campus_session_helpers.sql
--
-- OWNER: Mammu.
--
-- Session helpers built on the tables as they already are: app_users links to
-- a login through auth_user_id, and user_roles carries a scope rather than a
-- location column. A guard posted to Gate 1 is a user_roles row with
-- scope_type 'location' and scope_id set to that gate.
--
-- Every function here is SECURITY DEFINER on purpose. Policies on app_users
-- and user_roles have to read those same tables, and an invoker-rights
-- function would recurse. None of them exposes anything beyond the caller's
-- own tenant, role and posting.

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
  select r.scope_id
  from public.user_roles r
  join public.app_users u on u.id = r.user_id
  where u.auth_user_id = auth.uid()
    and u.status = 'active'
    and r.scope_type = 'location'
    and r.scope_id is not null
  limit 1;
$fn$;

grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_university_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_location_id() to authenticated;
