-- 0003_app_users_and_sessions.sql
--
-- OWNER: Mammu.
--
-- Staff accounts, role grants and the session helpers every policy relies on.

-- ---------------------------------------------------------------------------
-- app_users: one row per staff member who can sign in.
-- Mirrors auth.users so tenant and profile data stay in the public schema.
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  id            uuid primary key references auth.users (id) on delete cascade,
  university_id uuid not null references public.universities (id) on delete cascade,
  full_name     text not null,
  email         text not null,
  status        public.record_status not null default 'active',
  created_at    timestamptz not null default now()
);

create index if not exists app_users_university_idx on public.app_users (university_id);

-- ---------------------------------------------------------------------------
-- user_roles: role grants, optionally pinned to one campus location.
-- A guard is pinned to a gate, a librarian to a library. The posting is set by
-- an administrator; the role holder cannot change it.
-- location_id gains its foreign key in 0004, once campus_locations exists.
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.app_users (id) on delete cascade,
  university_id uuid not null references public.universities (id) on delete cascade,
  role          public.app_role not null,
  location_id   uuid,
  created_at    timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists user_roles_user_idx on public.user_roles (user_id);

-- ---------------------------------------------------------------------------
-- Session helpers.
--
-- Every one of these is SECURITY DEFINER on purpose: policies on app_users and
-- user_roles have to read those same tables, and an invoker-rights function
-- would recurse. They expose nothing beyond the caller's own tenant and role.
-- ---------------------------------------------------------------------------
create or replace function public.current_university_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select university_id
  from public.app_users
  where id = auth.uid() and status = 'active';
$$;

-- Highest-privilege role held, so that a multi-role account resolves the same
-- way everywhere instead of depending on row order.
create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.role
  from public.user_roles r
  join public.app_users u on u.id = r.user_id
  where r.user_id = auth.uid() and u.status = 'active'
  order by array_position(
    array[
      'super_admin', 'university_admin', 'registrar', 'department_admin',
      'issuer_officer', 'librarian', 'guard', 'verifier', 'staff', 'student'
    ]::public.app_role[],
    r.role
  )
  limit 1;
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles r
    join public.app_users u on u.id = r.user_id
    where r.user_id = auth.uid()
      and u.status = 'active'
      and r.role in ('super_admin', 'university_admin')
  );
$$;

-- The location a guard or librarian is posted to. Null for everyone else.
create or replace function public.current_user_location_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.location_id
  from public.user_roles r
  join public.app_users u on u.id = r.user_id
  where r.user_id = auth.uid()
    and u.status = 'active'
    and r.location_id is not null
  limit 1;
$$;

grant execute on function public.current_university_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_location_id() to authenticated;
