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
-- The current enrolment's number and department name, for one person.
--
-- Takes only a person id and never reads public.people. That matters twice:
-- an UPDATE cannot pass its own target table's column into a function in the
-- FROM clause, and a BEFORE INSERT trigger has no people row to read yet.
-- ---------------------------------------------------------------------------
drop function if exists public.person_projection(uuid);

create or replace function public.person_enrolment_projection(p_person_id uuid)
returns table (student_id text, department text)
language sql
stable
set search_path = public, pg_temp
as $fn$
  select e.student_number, d.name
  from public.enrolments e
  left join public.departments d on d.id = e.department_id
  where e.person_id = p_person_id
  -- The active enrolment wins; a student may have finished others.
  order by (e.status = 'active') desc, e.start_date desc nulls last
  limit 1;
$fn$;

-- ---------------------------------------------------------------------------
-- Backfill. Only ever fills a gap: a value somebody typed in by hand is left
-- where it is, because this migration is not entitled to overwrite it.
--
-- Two statements rather than one. The display name comes from columns already
-- on the row and needs no join, and doing it separately means a person with no
-- enrolment still gets a name.
-- ---------------------------------------------------------------------------
update public.people
set full_name = nullif(btrim(concat_ws(' ', given_name, family_name)), '')
where nullif(btrim(full_name), '') is null
  and nullif(btrim(concat_ws(' ', given_name, family_name)), '') is not null;

update public.people p
set
  student_id = coalesce(p.student_id, e.student_number),
  department = coalesce(p.department, d.name)
from (
  select distinct on (person_id)
         person_id, student_number, department_id
  from public.enrolments
  order by person_id, (status = 'active') desc, start_date desc nulls last
) e
left join public.departments d on d.id = e.department_id
where p.id = e.person_id
  and (p.student_id is null or p.department is null);

-- The library searches student_id and full_name on every keystroke.
create index if not exists people_student_id_idx
  on public.people (university_id, student_id);
create index if not exists people_role_name_idx
  on public.people (university_id, role, full_name);

-- ---------------------------------------------------------------------------
-- Keep it current.
--
-- Two triggers, because the value can change from either side: a new enrolment
-- gives an existing person their number, and a person may be inserted before
-- their enrolment exists.
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
    select * into v_proj from public.person_enrolment_projection(new.id);

    -- No enrolment yet is the normal case for a brand-new person. The trigger
    -- on enrolments fills these in as soon as one exists.
    if found then
      new.student_id := coalesce(new.student_id, v_proj.student_id);
      new.department := coalesce(new.department, v_proj.department);
    end if;
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
  select * into v_proj from public.person_enrolment_projection(new.person_id);
  if not found then return new; end if;

  -- Only touches student_id and department, neither of which the trigger on
  -- people watches, so the two cannot set each other off.
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
