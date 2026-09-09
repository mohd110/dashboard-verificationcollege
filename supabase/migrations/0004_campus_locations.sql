-- 0004_campus_locations.sql
--
-- OWNER: Mammu.
--
-- Physical points on campus where a student identity can be presented.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'location_type') then
    create type public.location_type as enum ('gate', 'library', 'office');
  end if;
end
$$;

create table if not exists public.campus_locations (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  code          text not null,
  name          text not null,
  type          public.location_type not null,
  status        public.record_status not null default 'active',
  created_at    timestamptz not null default now(),
  unique (university_id, code)
);

create index if not exists campus_locations_university_idx
  on public.campus_locations (university_id, status);

-- user_roles.location_id could not be constrained in 0003; the target table
-- did not exist yet.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_roles_location_id_fkey'
  ) then
    alter table public.user_roles
      add constraint user_roles_location_id_fkey
      foreign key (location_id) references public.campus_locations (id) on delete set null;
  end if;
end
$$;
