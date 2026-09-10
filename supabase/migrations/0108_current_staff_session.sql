-- 0108_current_staff_session.sql
--
-- OWNER: Mammu.
--
-- WHY THIS EXISTS
--
-- Every screen in the dashboard resolves the signed-in staff member before it
-- renders anything. That cost three network round trips:
--
--   1. the middleware calling auth.getUser()
--   2. the layout calling auth.getUser() again
--   3. a query against app_users to find the row, the university and the role
--   4. and, before 0107, a fourth query for the posting
--
-- Measured against this project, a round trip to Supabase is roughly 300 ms
-- and a one-row query costs almost exactly the same as a 150-row one. The data
-- is tiny; the latency is everything. So the way to make the dashboard quick is
-- to make fewer calls, not faster queries.
--
-- This function collapses steps 2, 3 and 4 into one. It resolves the caller
-- from auth.uid(), which PostgREST has already verified the signature of, so
-- there is nothing left for a separate getUser() to establish.
--
-- SECURITY DEFINER for the same reason as the helpers in 0102: the policies on
-- app_users and user_roles have to read those same tables, and an
-- invoker-rights function would recurse. It returns the caller's own row and
-- nothing else, and takes no arguments, so it cannot be pointed at anybody.

create or replace function public.current_staff_session()
returns table (
  user_id         uuid,
  auth_user_id    uuid,
  email           text,
  full_name       text,
  status          text,
  university_id   uuid,
  university_name text,
  university_code text,
  role            public.app_role,
  location_id     uuid,
  location_code   text,
  location_name   text,
  location_type   public.campus_location_type
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with me as (
    select u.*
    from public.app_users u
    where u.auth_user_id = auth.uid()
    limit 1
  ),
  -- The highest-privilege role held, ordered exactly as current_user_role()
  -- orders it, so the interface and the database never disagree about who
  -- somebody is.
  top_role as (
    select r.role
    from public.user_roles r
    join me on me.id = r.user_id
    order by array_position(
      array[
        'platform_admin', 'university_admin', 'registrar', 'department_admin',
        'card_operator', 'revocation_officer', 'librarian', 'guard',
        'verifier', 'auditor'
      ]::public.app_role[],
      r.role
    )
    limit 1
  ),
  -- The gate or library this person stands at. Null for every other role.
  posting as (
    select l.id, l.code, l.name, l.type
    from public.user_roles r
    join me on me.id = r.user_id
    join public.campus_locations l on l.id = r.location_id
    limit 1
  )
  select
    me.id,
    me.auth_user_id,
    coalesce(auth.jwt() ->> 'email', ''),
    me.display_name,
    me.status,
    me.university_id,
    coalesce(uni.legal_name, 'University'),
    coalesce(uni.code, ''),
    (select role from top_role),
    posting.id,
    posting.code,
    posting.name,
    posting.type
  from me
  left join public.universities uni on uni.id = me.university_id
  left join posting on true;
$fn$;

revoke all on function public.current_staff_session() from public;
grant execute on function public.current_staff_session() to authenticated;

comment on function public.current_staff_session() is
  'The signed-in staff member, their tenant, their role and their posting, in one round trip.';
