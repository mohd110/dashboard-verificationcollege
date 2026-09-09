-- 0106_shared_person_columns.sql
--
-- OWNER: Mammu. Agreed with Saif and Tabish, because it touches people.
--
-- WHY THIS EXISTS
--
-- Three applications read the same people table and disagree about where a
-- student's number and department live.
--
--   Saif's issuer reads enrolments.student_number and departments.code. Those
--   are the canonical values and are populated.
--
--   Tabish's library searches people.student_id and displays people.department.
--   Both columns exist and both are NULL for all 150 students, so his student
--   lookup finds nobody.
--
--   This dashboard reads people.student_id, people.department and
--   people.full_name, with the same result.
--
-- Rather than make two teams rewrite working queries, the duplicated columns
-- are filled from the canonical source and kept there by trigger. Nobody's
-- query changes; everybody's query starts returning rows.
--
-- Nothing canonical is rewritten. enrolments and departments stay the source
-- of truth; people.student_id and people.department become a maintained
-- projection of them.

-- ---------------------------------------------------------------------------
-- One definition of what the projected values are, so the backfill below and
-- the triggers further down cannot drift apart.
-- ---------------------------------------------------------------------------
create or replace function public.person_projection(p_person_id uuid)
returns table (student_id text, department text, full_name text)
language sql
stable
set search_path = public, pg_temp
as $fn$
  select
    e.student_number,
    d.name,
    nullif(btrim(concat_ws(' ', p.given_name, p.family_name)), '')
  from public.people p
  left join lateral (
    select student_number, department_id
    from public.enrolments
    where person_id = p.id
    order by (status = 'active') desc, start_date desc
    limit 1
  ) e on true
  left join public.departments d on d.id = e.department_id
  where p.id = p_person_id;
$fn$;

-- ---------------------------------------------------------------------------
-- Backfill. Only ever fills a gap: a value somebody has typed in by hand is
-- left where it is, because this migration is not entitled to overwrite it.
-- ---------------------------------------------------------------------------
update public.people p
set
  student_id = coalesce(p.student_id, proj.student_id),
  department = coalesce(p.department, proj.department),
  full_name  = coalesce(nullif(btrim(p.full_name), ''), proj.full_name)
from public.person_projection(p.id) proj
where p.student_id is null
   or p.department is null
   or nullif(btrim(p.full_name), '') is null;

-- The library searches student_id and full_name on every keystroke.
create index if not exists people_student_id_idx
  on public.people (university_id, student_id);
create index if not exists people_role_name_idx
  on public.people (university_id, role, full_name);

-- ---------------------------------------------------------------------------
-- Keep it current.
--
-- Two triggers, because the value can change from either side: a new enrolment
-- gives an existing person their number, and a new person may be inserted
-- after their enrolment already exists.
-- ---------------------------------------------------------------------------
create or replace function public.people_fill_projection()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_proj record;
begin
  new.full_name := coalesce(
    nullif(btrim(new.full_name), ''),
    nullif(btrim(concat_ws(' ', new.given_name, new.family_name)), '')
  );

  if new.student_id is null or new.department is null then
    select * into v_proj from public.person_projection(new.id);
    new.student_id := coalesce(new.student_id, v_proj.student_id);
    new.department := coalesce(new.department, v_proj.department);
  end if;

  return new;
end;
$fn$;

drop trigger if exists people_fill_projection on public.people;
create trigger people_fill_projection
  before insert or update of given_name, family_name on public.people
  for each row execute function public.people_fill_projection();

create or replace function public.enrolments_sync_person()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_proj record;
begin
  select * into v_proj from public.person_projection(new.person_id);

  update public.people
  set student_id = coalesce(v_proj.student_id, student_id),
      department = coalesce(v_proj.department, department)
  where id = new.person_id
    and (student_id is distinct from v_proj.student_id
      or department is distinct from v_proj.department);

  return new;
end;
$fn$;

drop trigger if exists enrolments_sync_person on public.enrolments;
create trigger enrolments_sync_person
  after insert or update of student_number, department_id, status on public.enrolments
  for each row execute function public.enrolments_sync_person();

comment on column public.people.student_id is
  'Projection of enrolments.student_number, maintained by trigger. Canonical value lives in enrolments.';
comment on column public.people.department is
  'Projection of departments.name for the current enrolment, maintained by trigger.';
