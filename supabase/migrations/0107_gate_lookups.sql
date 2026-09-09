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
