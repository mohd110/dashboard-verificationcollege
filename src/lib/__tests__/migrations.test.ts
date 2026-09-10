import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Runs the migrations this repository owns against a real Postgres.
 *
 * Reading SQL and believing it works is how migration 0106 shipped with an
 * `UPDATE ... FROM person_projection(p.id)`, which Postgres rejects outright:
 * the target table of an UPDATE is not available to a function in the FROM
 * clause. Nothing short of executing it would have caught that, and it failed
 * in the Supabase SQL editor rather than here.
 *
 * PGlite is Postgres compiled to WebAssembly, so this is the real parser and
 * the real planner, in process, with no server to install.
 *
 * The fixture below is a stand-in for the parts of the shared schema these
 * migrations touch, not a copy of it. Saif owns people, enrolments and
 * departments; this only reproduces the columns and constraints the migrations
 * actually depend on.
 */

const MIGRATIONS = [
  '0106_shared_person_columns.sql',
  '0107_gate_lookups.sql',
  '0108_current_staff_session.sql',
];

function migration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8');
}

/**
 * The shared schema, reduced to what the migrations touch.
 *
 * auth.uid() and auth.jwt() are stubbed, because PGlite has no Supabase auth
 * schema. They return a value a test can set, which is what makes the
 * tenant-scoped functions testable at all.
 */
const FIXTURE = `
-- Supabase's roles. The migrations grant execute to them, and bare Postgres
-- has never heard of them.
create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;

create table auth.state (uid uuid, email text);
insert into auth.state values (null, null);

create or replace function auth.uid() returns uuid
  language sql stable as $$ select uid from auth.state limit 1 $$;

create or replace function auth.jwt() returns jsonb
  language sql stable as $$ select jsonb_build_object('email', email) from auth.state limit 1 $$;

create type public.app_role as enum (
  'platform_admin', 'university_admin', 'department_admin', 'card_operator',
  'revocation_officer', 'verifier', 'auditor', 'registrar', 'guard', 'librarian'
);
create type public.person_status as enum ('active', 'inactive', 'archived');
create type public.enrolment_status as enum ('active', 'completed', 'withdrawn', 'suspended');
create type public.campus_location_type as enum ('gate', 'library', 'hostel', 'lab', 'general');
create type public.credential_state as enum ('active', 'suspended', 'revoked', 'superseded', 'expired');

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  legal_name text not null
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  code text not null,
  name text not null
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  given_name text,
  family_name text,
  email text,
  status public.person_status not null default 'active',
  photo_object_key text,
  student_id text,
  role text,
  department text,
  full_name text
);

create table public.enrolments (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  person_id uuid not null references public.people(id),
  department_id uuid references public.departments(id),
  student_number text not null,
  programme text,
  status public.enrolment_status not null default 'active',
  start_date date not null default current_date
);

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id),
  display_name text,
  status text not null default 'active',
  auth_user_id uuid
);

create table public.campus_locations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  code text not null,
  name text not null,
  type public.campus_location_type not null,
  status text not null default 'active'
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id),
  role public.app_role not null,
  location_id uuid references public.campus_locations(id)
);

create table public.issuer_keys (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  kid text not null,
  alg text not null,
  public_jwk jsonb not null,
  status text not null default 'active',
  not_before timestamptz not null default now(),
  not_after timestamptz
);

create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  person_id uuid not null references public.people(id),
  jti text not null,
  expires_at timestamptz
);

create table public.credential_status (
  credential_id uuid primary key references public.credentials(id),
  status public.credential_state not null default 'active',
  reason_code text
);

-- The session helpers from 0102, which 0107 builds on.
create or replace function public.current_university_id() returns uuid
  language sql stable as $$
    select university_id from public.app_users
    where auth_user_id = auth.uid() and status = 'active' limit 1
  $$;
`;

/** Northfield, one department, one student with an enrolment. */
const SEED = `
insert into public.universities (id, code, legal_name)
values ('11111111-1111-4111-8111-111111111111', 'nort', 'Northfield University');

insert into public.departments (id, university_id, code, name)
values ('22222222-2222-4222-8222-000000000001',
        '11111111-1111-4111-8111-111111111111', 'BIO', 'Biological Sciences');

insert into public.people (id, university_id, given_name, family_name, role)
values ('33333333-3333-4333-8333-000000000001',
        '11111111-1111-4111-8111-111111111111', 'Rahul', 'Moreau', 'student');

insert into public.enrolments (university_id, person_id, department_id, student_number, programme)
values ('11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-000000000001',
        '22222222-2222-4222-8222-000000000001', 'NU20260003', 'BSc Molecular Biology');

-- Somebody whose number was typed in by hand before any of this existed. The
-- backfill must leave it alone.
insert into public.people (id, university_id, given_name, family_name, role, student_id)
values ('33333333-3333-4333-8333-000000000009',
        '11111111-1111-4111-8111-111111111111', 'Hana', 'Haddad', 'student', 'HAND-TYPED');

insert into public.enrolments (university_id, person_id, department_id, student_number)
values ('11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-000000000009',
        '22222222-2222-4222-8222-000000000001', 'NU20260006');
`;

describe('migrations 0106, 0107 and 0108', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(FIXTURE);
    await db.exec(SEED);

    // Deliberately in the order the SQL editor runs them, as one script.
    for (const name of MIGRATIONS) {
      await db.exec(migration(name));
    }
  }, 60_000);

  it('applies without error, which is the thing that failed in production', async () => {
    const { rows } = await db.query<{ count: number }>(
      `select count(*)::int as count from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('person_enrolment_projection', 'resolve_credential_holder',
                           'resolve_person_by_code', 'published_issuer_keys',
                           'current_staff_session')`,
    );
    expect(rows[0].count).toBe(5);
  });

  it('backfills the columns the library searches on', async () => {
    const { rows } = await db.query<{ student_id: string; department: string; full_name: string }>(
      `select student_id, department, full_name from public.people
       where id = '33333333-3333-4333-8333-000000000001'`,
    );

    expect(rows[0].student_id).toBe('NU20260003');
    expect(rows[0].department).toBe('Biological Sciences');
    expect(rows[0].full_name).toBe('Rahul Moreau');
  });

  it('is safe to run twice, because somebody always runs it twice', async () => {
    for (const name of MIGRATIONS) {
      await expect(db.exec(migration(name))).resolves.toBeDefined();
    }
  }, 60_000);

  it('leaves a hand-typed value alone when backfilling', async () => {
    // The backfill runs once against rows it knows nothing about. It fills
    // gaps and touches nothing else, because it cannot tell a stale value from
    // a deliberate one.
    const { rows } = await db.query<{ student_id: string; department: string }>(
      `select student_id, department from public.people
       where id = '33333333-3333-4333-8333-000000000009'`,
    );

    expect(rows[0].student_id).toBe('HAND-TYPED');
    // The department was empty, so the enrolment was allowed to fill it.
    expect(rows[0].department).toBe('Biological Sciences');
  });

  it('lets the enrolment win from then on, because it is the canonical value', async () => {
    // Different rule, deliberately. Once the projection is live, the enrolment
    // is the source of truth and people.student_id follows it. Anything
    // written straight into people.student_id is overwritten on the next
    // enrolment change, which is why nothing should write there directly.
    await db.exec(`
      update public.people set student_id = 'TYPED-AFTERWARDS'
      where id = '33333333-3333-4333-8333-000000000009';

      update public.enrolments set status = 'active'
      where person_id = '33333333-3333-4333-8333-000000000009';
    `);

    const { rows } = await db.query<{ student_id: string }>(
      `select student_id from public.people
       where id = '33333333-3333-4333-8333-000000000009'`,
    );

    expect(rows[0].student_id).toBe('NU20260006');
  });

  it('fills a person who was created before their enrolment existed', async () => {
    await db.exec(`
      insert into public.people (id, university_id, given_name, family_name, role)
      values ('33333333-3333-4333-8333-000000000003',
              '11111111-1111-4111-8111-111111111111', 'Omar', 'Larsen', 'student');
    `);

    const before = await db.query<{ student_id: string | null; full_name: string }>(
      `select student_id, full_name from public.people
       where id = '33333333-3333-4333-8333-000000000003'`,
    );
    // The name comes from the row itself, so the insert trigger has it already.
    expect(before.rows[0].full_name).toBe('Omar Larsen');
    expect(before.rows[0].student_id).toBeNull();

    await db.exec(`
      insert into public.enrolments (university_id, person_id, department_id, student_number)
      values ('11111111-1111-4111-8111-111111111111',
              '33333333-3333-4333-8333-000000000003',
              '22222222-2222-4222-8222-000000000001', 'NU20260007');
    `);

    const after = await db.query<{ student_id: string; department: string }>(
      `select student_id, department from public.people
       where id = '33333333-3333-4333-8333-000000000003'`,
    );
    expect(after.rows[0].student_id).toBe('NU20260007');
    expect(after.rows[0].department).toBe('Biological Sciences');
  });

  it('follows a student number that changes on the enrolment', async () => {
    await db.exec(
      `update public.enrolments set student_number = 'NU20269999'
       where person_id = '33333333-3333-4333-8333-000000000003'`,
    );

    const { rows } = await db.query<{ student_id: string }>(
      `select student_id from public.people
       where id = '33333333-3333-4333-8333-000000000003'`,
    );
    expect(rows[0].student_id).toBe('NU20269999');
  });

  it('answers resolve_person_by_code only inside the caller’s own university', async () => {
    await db.exec(`
      insert into public.app_users (id, university_id, display_name, auth_user_id)
      values ('44444444-4444-4444-8444-000000000001',
              '11111111-1111-4111-8111-111111111111', 'Amit',
              '44444444-4444-4444-8444-000000000001');
      update auth.state set uid = '44444444-4444-4444-8444-000000000001';
    `);

    const found = await db.query<{ full_name: string }>(
      `select full_name from public.resolve_person_by_code('NU20260003')`,
    );
    expect(found.rows[0].full_name).toBe('Rahul Moreau');

    // Signed out, the same call answers nothing rather than everything.
    await db.exec(`update auth.state set uid = null`);
    const anonymous = await db.query(`select * from public.resolve_person_by_code('NU20260003')`);
    expect(anonymous.rows).toHaveLength(0);
  });
  it('returns the whole session in one call, posting included', async () => {
    await db.exec(`
      insert into public.campus_locations (id, university_id, code, name, type)
      values ('55555555-5555-4555-8555-000000000001',
              '11111111-1111-4111-8111-111111111111', 'GATE-1', 'Main Gate', 'gate');

      insert into public.app_users (id, university_id, display_name, auth_user_id)
      values ('66666666-6666-4666-8666-000000000001',
              '11111111-1111-4111-8111-111111111111', 'Amit Guard',
              '66666666-6666-4666-8666-000000000001')
      on conflict (id) do nothing;

      insert into public.user_roles (user_id, role, location_id)
      values ('66666666-6666-4666-8666-000000000001', 'guard',
              '55555555-5555-4555-8555-000000000001');

      update auth.state set uid = '66666666-6666-4666-8666-000000000001',
                            email = 'amit@demo.gbpuat.test';
    `);

    const { rows } = await db.query<{
      full_name: string;
      email: string;
      role: string;
      university_code: string;
      location_name: string;
      location_type: string;
    }>(`select * from public.current_staff_session()`);

    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBe('Amit Guard');
    expect(rows[0].email).toBe('amit@demo.gbpuat.test');
    expect(rows[0].role).toBe('guard');
    expect(rows[0].university_code).toBe('nort');
    expect(rows[0].location_name).toBe('Main Gate');
    expect(rows[0].location_type).toBe('gate');
  });

  it('picks the highest-privilege role when somebody holds several', async () => {
    await db.exec(`
      insert into public.user_roles (user_id, role)
      values ('66666666-6666-4666-8666-000000000001', 'university_admin');
    `);

    const { rows } = await db.query<{ role: string }>(
      `select role from public.current_staff_session()`,
    );
    expect(rows[0].role).toBe('university_admin');
  });

  it('answers nothing at all when nobody is signed in', async () => {
    await db.exec(`update auth.state set uid = null, email = null`);
    const { rows } = await db.query(`select * from public.current_staff_session()`);
    expect(rows).toHaveLength(0);
  });
});
