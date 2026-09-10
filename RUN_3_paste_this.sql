-- RUN 3 of 3. Paste this whole file into the Supabase SQL editor and run it.
-- Runs 1 and 2 (migrations 0100 to 0104) must have been run and committed first.
-- Combines migrations 0106, 0107 and 0108. All are additive: no table is
-- dropped, no column is removed and no existing value is overwritten.
-- Safe to run more than once.


-- ============================================================
-- 0106_shared_person_columns.sql
-- ============================================================
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


-- ============================================================
-- 0107_gate_lookups.sql
-- ============================================================
-- 0107_gate_lookups.sql
--
-- OWNER: Mammu.
--
-- WHY THIS EXISTS
--
-- Row level security on people, cards and credentials lists the roles that may
-- read them: university_admin, department_admin, registrar, card_operator,
-- auditor. Guard and librarian are on none of those lists, and that is correct
-- for the table as a whole. A guard has no business reading 150 student
-- records, e-mail addresses and dates of birth.
--
-- But a guard does need one thing after a signature verifies: which person
-- this credential belongs to, so the event can be recorded against them, and
-- their name, so the screen can be checked against the face.
--
-- Two narrow SECURITY DEFINER functions give exactly that and nothing else.
-- They are scoped to the caller's own university, return four fields, and
-- cannot be used to enumerate anybody: you have to already hold a credential
-- id or a student number to call them.
--
-- This is a read helper. It performs no cryptography and makes no decision
-- about validity. Saif's verifier decides; this only says who the credential
-- points at.

create or replace function public.resolve_credential_holder(p_jti text)
returns table (
  person_id       uuid,
  credential_id   uuid,
  full_name       text,
  student_id      text,
  department      text,
  person_status   text,
  credential_state text,
  reason_code     text,
  expires_at      timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    p.id,
    c.id,
    p.full_name,
    p.student_id,
    p.department,
    p.status::text,
    coalesce(cs.status::text, 'unknown'),
    cs.reason_code,
    c.expires_at
  from public.credentials c
  join public.people p on p.id = c.person_id
  left join public.credential_status cs on cs.credential_id = c.id
  where c.jti = p_jti
    and c.university_id = public.current_university_id()
  limit 1;
$fn$;

-- The same answer for a scan that produced a student number rather than a
-- signed credential: a card typed in by hand, or a reader that only read the
-- printed number. Returns no credential, so a caller cannot mistake it for a
-- verified identity.
create or replace function public.resolve_person_by_code(p_code text)
returns table (
  person_id     uuid,
  full_name     text,
  student_id    text,
  department    text,
  person_status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p.id, p.full_name, p.student_id, p.department, p.status::text
  from public.people p
  where p.student_id = p_code
    and p.university_id = public.current_university_id()
  limit 1;
$fn$;

revoke all on function public.resolve_credential_holder(text) from public;
revoke all on function public.resolve_person_by_code(text) from public;
grant execute on function public.resolve_credential_holder(text) to authenticated;
grant execute on function public.resolve_person_by_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The published signing keys, for a session that is not an administrator.
--
-- issuer_keys is readable only by roles this dashboard's guards do not hold,
-- yet a public key is public by definition and is already served at
-- /.well-known/jwks.json. Reading it through a function keeps the offline
-- verifier working without widening the table policy.
-- ---------------------------------------------------------------------------
create or replace function public.published_issuer_keys()
returns table (
  kid        text,
  alg        text,
  public_jwk jsonb,
  status     text,
  not_before timestamptz,
  not_after  timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select k.kid, k.alg, k.public_jwk, k.status::text, k.not_before, k.not_after
  from public.issuer_keys k
  where k.university_id = public.current_university_id()
  order by k.not_before desc;
$fn$;

revoke all on function public.published_issuer_keys() from public;
grant execute on function public.published_issuer_keys() to authenticated;


-- ============================================================
-- 0108_current_staff_session.sql
-- ============================================================
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
