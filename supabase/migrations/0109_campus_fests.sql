-- 0109_campus_fests.sql
--
-- Fests and campus events: the fest itself, who coordinates it, which guards
-- work it, and which students have had their class attendance regularised for
-- the days they were there.
--
-- Purely additive. Four new tables, their policies and nothing else. No
-- existing table, column, function or policy is touched.
--
-- The design choice worth knowing before reading on: attendance is NOT stored
-- here. Every fest gets a campus_locations row of its own, guards on fest duty
-- record their gate scans against it through record_campus_event, and so a
-- student's attendance is a set of rows in campus_events — sealed into the same
-- hash chain as every gate check and library issue, and exactly as tamper-
-- evident. What this migration stores is the one thing that has to be editable:
-- the decision to regularise, or not, for each student and day.
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------
-- The fest.
-- ---------------------------------------------------------------------------
create table if not exists public.campus_fests (
  id                    uuid primary key default gen_random_uuid(),
  university_id         uuid not null references public.universities (id),
  -- The fest's own location. Scans recorded here are the attendance record.
  location_id           uuid not null references public.campus_locations (id),
  name                  text not null check (length(trim(name)) between 3 and 120),
  category              text not null default 'cultural'
                          check (category in ('cultural', 'technical', 'sports',
                                              'academic', 'agricultural', 'other')),
  description           text,
  venue                 text,
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  -- Whether attending excuses a student from class. A fest can be run for
  -- the evening only, in which case nothing needs regularising.
  regularise_attendance boolean not null default true,
  cancelled_at          timestamptz,
  created_by            uuid references public.app_users (id),
  created_at            timestamptz not null default now(),
  constraint campus_fests_window check (ends_at > starts_at)
);

-- One fest per location: the location IS the fest, as far as the chain knows.
create unique index if not exists campus_fests_location_key
  on public.campus_fests (location_id);

create index if not exists campus_fests_university_time_idx
  on public.campus_fests (university_id, starts_at desc);

-- ---------------------------------------------------------------------------
-- Coordinators. Not necessarily staff accounts: a faculty coordinator, a
-- student secretary and a volunteer lead all need listing, and most will never
-- sign in to anything.
-- ---------------------------------------------------------------------------
create table if not exists public.fest_coordinators (
  id            uuid primary key default gen_random_uuid(),
  fest_id       uuid not null references public.campus_fests (id) on delete cascade,
  university_id uuid not null references public.universities (id),
  full_name     text not null check (length(trim(full_name)) between 2 and 120),
  designation   text not null check (length(trim(designation)) between 2 and 120),
  kind          text not null default 'faculty'
                  check (kind in ('faculty', 'student', 'staff', 'volunteer')),
  -- Set when the coordinator is on the register, so a student coordinator's
  -- own attendance can be regularised as on-duty.
  person_id     uuid references public.people (id),
  phone         text,
  email         text,
  created_at    timestamptz not null default now()
);

create index if not exists fest_coordinators_fest_idx
  on public.fest_coordinators (fest_id);

-- ---------------------------------------------------------------------------
-- Guard duties. A guard keeps their ordinary posting; for the length of a shift
-- the gate application records their scans against the fest instead.
-- ---------------------------------------------------------------------------
create table if not exists public.fest_guard_duties (
  id              uuid primary key default gen_random_uuid(),
  fest_id         uuid not null references public.campus_fests (id) on delete cascade,
  university_id   uuid not null references public.universities (id),
  guard_user_id   uuid not null references public.app_users (id),
  -- Where on the fest ground: "Gate B", "Main stage entry".
  post            text not null check (length(trim(post)) between 2 and 80),
  shift_starts_at timestamptz not null,
  shift_ends_at   timestamptz not null,
  created_by      uuid references public.app_users (id),
  created_at      timestamptz not null default now(),
  constraint fest_guard_duties_window check (shift_ends_at > shift_starts_at)
);

create index if not exists fest_guard_duties_guard_time_idx
  on public.fest_guard_duties (guard_user_id, shift_starts_at);

create index if not exists fest_guard_duties_fest_idx
  on public.fest_guard_duties (fest_id);

-- ---------------------------------------------------------------------------
-- Regularisation decisions.
--
-- A student scanned at the fest with no row here is PENDING — that is derived,
-- not stored, so there is never a backlog of placeholder rows to reconcile.
-- A row records a decision: approved or rejected, by whom, and on what basis.
--
-- basis says why the student is on the list at all:
--   scanned  their card was checked at a fest gate; the chain proves it
--   on_duty  coordinator or volunteer working the fest, who may never have
--            passed a gate at all
--   manual   anything else an administrator vouches for, with a note
-- ---------------------------------------------------------------------------
create table if not exists public.fest_regularisations (
  id            uuid primary key default gen_random_uuid(),
  fest_id       uuid not null references public.campus_fests (id) on delete cascade,
  university_id uuid not null references public.universities (id),
  person_id     uuid not null references public.people (id),
  attended_on   date not null,
  status        text not null default 'approved'
                  check (status in ('approved', 'rejected')),
  basis         text not null default 'scanned'
                  check (basis in ('scanned', 'on_duty', 'manual')),
  note          text,
  decided_by    uuid references public.app_users (id),
  decided_at    timestamptz not null default now(),
  -- A student not seen at a gate is only on the list because somebody said
  -- so, and that somebody has to say why.
  constraint fest_regularisations_reason
    check (basis = 'scanned' or length(trim(coalesce(note, ''))) > 0),
  constraint fest_regularisations_once
    unique (fest_id, person_id, attended_on)
);

create index if not exists fest_regularisations_person_idx
  on public.fest_regularisations (person_id);

-- ---------------------------------------------------------------------------
-- Is this fest one of the caller's university's own?
--
-- Used by the write policies below. A foreign key proves the fest exists; it
-- does not prove it belongs to the tenant writing against it.
-- ---------------------------------------------------------------------------
create or replace function public.fest_in_my_university(p_fest_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.campus_fests f
    where f.id = p_fest_id
      and f.university_id = public.current_university_id()
  );
$fn$;

revoke all on function public.fest_in_my_university(uuid) from public;
grant execute on function public.fest_in_my_university(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security.
--
-- Read: anyone signed in at the university can see its fests and coordinators,
-- because a guard needs the coordinator's phone number and nothing about a fest
-- programme is private. A guard sees only their own duties. Regularisation
-- decisions are for administrators.
--
-- Write: administrators, within their own university, and nobody else.
-- ---------------------------------------------------------------------------
alter table public.campus_fests          enable row level security;
alter table public.fest_coordinators     enable row level security;
alter table public.fest_guard_duties     enable row level security;
alter table public.fest_regularisations  enable row level security;

drop policy if exists campus_fests_read on public.campus_fests;
create policy campus_fests_read on public.campus_fests
  for select to authenticated
  using (university_id = public.current_university_id());

drop policy if exists campus_fests_admin_write on public.campus_fests;
create policy campus_fests_admin_write on public.campus_fests
  for all to authenticated
  using (public.current_user_is_admin() and university_id = public.current_university_id())
  with check (public.current_user_is_admin() and university_id = public.current_university_id());

drop policy if exists fest_coordinators_read on public.fest_coordinators;
create policy fest_coordinators_read on public.fest_coordinators
  for select to authenticated
  using (university_id = public.current_university_id());

drop policy if exists fest_coordinators_admin_write on public.fest_coordinators;
create policy fest_coordinators_admin_write on public.fest_coordinators
  for all to authenticated
  using (public.current_user_is_admin() and university_id = public.current_university_id())
  with check (
    public.current_user_is_admin()
    and university_id = public.current_university_id()
    and public.fest_in_my_university(fest_id)
  );

drop policy if exists fest_guard_duties_read on public.fest_guard_duties;
create policy fest_guard_duties_read on public.fest_guard_duties
  for select to authenticated
  using (
    university_id = public.current_university_id()
    and (public.current_user_is_admin() or guard_user_id = public.current_app_user_id())
  );

drop policy if exists fest_guard_duties_admin_write on public.fest_guard_duties;
create policy fest_guard_duties_admin_write on public.fest_guard_duties
  for all to authenticated
  using (public.current_user_is_admin() and university_id = public.current_university_id())
  with check (
    public.current_user_is_admin()
    and university_id = public.current_university_id()
    and public.fest_in_my_university(fest_id)
  );

drop policy if exists fest_regularisations_admin on public.fest_regularisations;
create policy fest_regularisations_admin on public.fest_regularisations
  for all to authenticated
  using (public.current_user_is_admin() and university_id = public.current_university_id())
  with check (
    public.current_user_is_admin()
    and university_id = public.current_university_id()
    and public.fest_in_my_university(fest_id)
  );

-- Supabase grants new public tables to these roles by default privilege; bare
-- Postgres does not, and saying so explicitly costs nothing.
grant select, insert, update, delete on public.campus_fests         to authenticated, service_role;
grant select, insert, update, delete on public.fest_coordinators    to authenticated, service_role;
grant select, insert, update, delete on public.fest_guard_duties    to authenticated, service_role;
grant select, insert, update, delete on public.fest_regularisations to authenticated, service_role;

revoke all on public.campus_fests         from anon;
revoke all on public.fest_coordinators    from anon;
revoke all on public.fest_guard_duties    from anon;
revoke all on public.fest_regularisations from anon;
