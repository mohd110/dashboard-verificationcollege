-- 0001_core_prerequisites.sql
--
-- OWNER: core identity schema (Saif).
--
-- The team handoff lists universities, departments, people and enrolments as
-- already existing. They are recreated here only so that Mammu's tables have
-- foreign key targets in a clean database. Every statement is idempotent, so
-- applying this file against a database that already holds the core schema is
-- a no-op. If the live column names differ, reconcile here before 0002 runs.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- universities
-- ---------------------------------------------------------------------------
create table if not exists public.universities (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  short_name  text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------
create table if not exists public.departments (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  code          text not null,
  name          text not null,
  created_at    timestamptz not null default now(),
  unique (university_id, code)
);

-- ---------------------------------------------------------------------------
-- people
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'person_type') then
    create type public.person_type as enum ('student', 'staff');
  end if;
  if not exists (select 1 from pg_type where typname = 'record_status') then
    create type public.record_status as enum ('active', 'inactive');
  end if;
end
$$;

create table if not exists public.people (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  person_code   text not null,
  full_name     text not null,
  email         text,
  person_type   public.person_type not null default 'student',
  department_id uuid references public.departments (id) on delete set null,
  status        public.record_status not null default 'active',
  created_at    timestamptz not null default now(),
  unique (university_id, person_code)
);

create index if not exists people_university_idx on public.people (university_id);
create index if not exists people_name_idx on public.people (university_id, full_name);

-- ---------------------------------------------------------------------------
-- enrolments
-- ---------------------------------------------------------------------------
create table if not exists public.enrolments (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  person_id     uuid not null references public.people (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  programme     text not null,
  academic_year text not null,
  status        public.record_status not null default 'active',
  created_at    timestamptz not null default now(),
  unique (person_id, programme, academic_year)
);

create index if not exists enrolments_person_idx on public.enrolments (person_id);
