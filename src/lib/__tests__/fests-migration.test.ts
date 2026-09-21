import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Migration 0109 against a real Postgres, policies included.
 *
 * The other migration test runs as the superuser, which bypasses row level
 * security entirely. That would prove this file parses and nothing more, and
 * the policies are most of what it is for. So these tests switch to the
 * `authenticated` role before asserting anything about who may read or write,
 * which is the role every signed-in Supabase request runs as.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '0109_campus_fests.sql'),
  'utf8',
);

const NORTHFIELD = '11111111-1111-4111-8111-111111111111';
const SOUTHGATE = '55555555-5555-4555-8555-555555555555';

const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const GUARD = 'aaaaaaaa-0000-4000-8000-000000000002';
const OTHER_GUARD = 'aaaaaaaa-0000-4000-8000-000000000003';
const SOUTH_ADMIN = 'aaaaaaaa-0000-4000-8000-000000000004';

const STUDENT = 'bbbbbbbb-0000-4000-8000-000000000001';
const FEST_LOCATION = 'cccccccc-0000-4000-8000-000000000001';
const FEST = 'dddddddd-0000-4000-8000-000000000001';

/** The shared schema, reduced to what 0109 references, plus the 0102 helpers. */
const FIXTURE = `
create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;
create table auth.state (uid uuid);
insert into auth.state values (null);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select uid from auth.state limit 1 $$;

grant usage on schema auth to authenticated;
grant select on auth.state to authenticated;

create type public.app_role as enum (
  'platform_admin', 'university_admin', 'department_admin', 'card_operator',
  'revocation_officer', 'verifier', 'auditor', 'registrar', 'guard', 'librarian'
);
create type public.campus_location_type as enum ('gate', 'library', 'hostel', 'lab', 'general');

create table public.universities (id uuid primary key, code text, legal_name text);
create table public.people (
  id uuid primary key, university_id uuid references public.universities(id), full_name text
);
create table public.app_users (
  id uuid primary key, university_id uuid references public.universities(id),
  display_name text, status text not null default 'active', auth_user_id uuid
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id), role public.app_role not null
);
create table public.campus_locations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id),
  code text, name text, type public.campus_location_type, status text default 'active'
);

-- The 0102 helpers, verbatim in behaviour.
create or replace function public.current_app_user_id() returns uuid
  language sql stable security definer set search_path = public, pg_temp as $fn$
  select id from public.app_users where auth_user_id = auth.uid() and status = 'active' limit 1;
$fn$;
create or replace function public.current_university_id() returns uuid
  language sql stable security definer set search_path = public, pg_temp as $fn$
  select university_id from public.app_users
  where auth_user_id = auth.uid() and status = 'active' limit 1;
$fn$;
create or replace function public.current_user_is_admin() returns boolean
  language sql stable security definer set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from public.user_roles r join public.app_users u on u.id = r.user_id
    where u.auth_user_id = auth.uid() and u.status = 'active'
      and r.role in ('platform_admin', 'university_admin')
  );
$fn$;

grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_university_id() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
`;

const SEED = `
insert into public.universities values
  ('${NORTHFIELD}', 'northfield', 'Northfield University'),
  ('${SOUTHGATE}', 'southgate', 'Southgate Institute');

insert into public.people values ('${STUDENT}', '${NORTHFIELD}', 'Rahul Kumar');

insert into public.app_users (id, university_id, display_name, auth_user_id) values
  ('${ADMIN}', '${NORTHFIELD}', 'Admin', '${ADMIN}'),
  ('${GUARD}', '${NORTHFIELD}', 'Amit', '${GUARD}'),
  ('${OTHER_GUARD}', '${NORTHFIELD}', 'Ravi', '${OTHER_GUARD}'),
  ('${SOUTH_ADMIN}', '${SOUTHGATE}', 'South Admin', '${SOUTH_ADMIN}');

insert into public.user_roles (user_id, role) values
  ('${ADMIN}', 'university_admin'),
  ('${GUARD}', 'guard'),
  ('${OTHER_GUARD}', 'guard'),
  ('${SOUTH_ADMIN}', 'university_admin');

insert into public.campus_locations (id, university_id, code, name, type)
values ('${FEST_LOCATION}', '${NORTHFIELD}', 'FEST-MELA', 'Kisan Mela', 'general');
`;

describe('migration 0109, campus fests', () => {
  let db: PGlite;

  /** Runs one statement as a signed-in user, the way PostgREST would. */
  async function as<T = Record<string, unknown>>(uid: string, sql: string) {
    await db.exec(`reset role; update auth.state set uid = '${uid}'; set role authenticated;`);
    try {
      return await db.query<T>(sql);
    } finally {
      await db.exec('reset role;');
    }
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(FIXTURE);
    await db.exec(SEED);
    await db.exec(MIGRATION);
  }, 60_000);

  it('applies cleanly, and again on a second run', async () => {
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();

    const { rows } = await db.query<{ count: number }>(
      `select count(*)::int as count from information_schema.tables
       where table_schema = 'public'
         and table_name in ('campus_fests', 'fest_coordinators',
                            'fest_guard_duties', 'fest_regularisations')`,
    );
    expect(rows[0].count).toBe(4);
  }, 60_000);

  it('lets an administrator create a fest', async () => {
    await as(
      ADMIN,
      `insert into public.campus_fests (id, university_id, location_id, name, starts_at, ends_at)
       values ('${FEST}', '${NORTHFIELD}', '${FEST_LOCATION}', 'Kisan Mela 2026',
               now() - interval '1 hour', now() + interval '2 days')`,
    );

    const { rows } = await as<{ name: string }>(GUARD, `select name from public.campus_fests`);
    // And a guard can read it, because a guard on duty needs to.
    expect(rows.map((row) => row.name)).toEqual(['Kisan Mela 2026']);
  });

  it('refuses a fest created by somebody who is not an administrator', async () => {
    await expect(
      as(
        GUARD,
        `insert into public.campus_fests (university_id, location_id, name, starts_at, ends_at)
         values ('${NORTHFIELD}', '${FEST_LOCATION}', 'Unofficial Party', now(), now() + interval '1 day')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('refuses a fest that ends before it starts', async () => {
    await expect(
      db.exec(
        `insert into public.campus_fests (university_id, location_id, name, starts_at, ends_at)
         values ('${NORTHFIELD}', gen_random_uuid(), 'Backwards', now(), now() - interval '1 day')`,
      ),
    ).rejects.toThrow();
  });

  it('shows a guard their own duties and nobody else’s', async () => {
    await as(
      ADMIN,
      `insert into public.fest_guard_duties
         (fest_id, university_id, guard_user_id, post, shift_starts_at, shift_ends_at)
       values
         ('${FEST}', '${NORTHFIELD}', '${GUARD}', 'Gate B', now() - interval '1 hour', now() + interval '6 hours'),
         ('${FEST}', '${NORTHFIELD}', '${OTHER_GUARD}', 'Main stage', now(), now() + interval '6 hours')`,
    );

    const mine = await as<{ post: string }>(GUARD, `select post from public.fest_guard_duties`);
    expect(mine.rows.map((row) => row.post)).toEqual(['Gate B']);

    const everyone = await as<{ post: string }>(
      ADMIN,
      `select post from public.fest_guard_duties order by post`,
    );
    expect(everyone.rows.map((row) => row.post)).toEqual(['Gate B', 'Main stage']);
  });

  it('keeps one university out of another’s fests entirely', async () => {
    const seen = await as(SOUTH_ADMIN, `select * from public.campus_fests`);
    expect(seen.rows).toHaveLength(0);

    // Writing against a Northfield fest while claiming Southgate as the tenant.
    await expect(
      as(
        SOUTH_ADMIN,
        `insert into public.fest_coordinators (fest_id, university_id, full_name, designation)
         values ('${FEST}', '${SOUTHGATE}', 'Intruder', 'Coordinator')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('insists on a reason for anybody regularised without a gate scan', async () => {
    await expect(
      as(
        ADMIN,
        `insert into public.fest_regularisations
           (fest_id, university_id, person_id, attended_on, basis)
         values ('${FEST}', '${NORTHFIELD}', '${STUDENT}', current_date, 'on_duty')`,
      ),
    ).rejects.toThrow(/fest_regularisations_reason/);

    await as(
      ADMIN,
      `insert into public.fest_regularisations
         (fest_id, university_id, person_id, attended_on, basis, note)
       values ('${FEST}', '${NORTHFIELD}', '${STUDENT}', current_date, 'on_duty',
               'Stage volunteer, cultural night')`,
    );

    const { rows } = await as<{ status: string }>(
      ADMIN,
      `select status from public.fest_regularisations`,
    );
    expect(rows[0].status).toBe('approved');
  });

  it('records one decision per student per day', async () => {
    await expect(
      as(
        ADMIN,
        `insert into public.fest_regularisations
           (fest_id, university_id, person_id, attended_on, basis)
         values ('${FEST}', '${NORTHFIELD}', '${STUDENT}', current_date, 'scanned')`,
      ),
    ).rejects.toThrow(/fest_regularisations_once/);
  });

  it('keeps regularisation decisions away from a guard', async () => {
    const { rows } = await as(GUARD, `select * from public.fest_regularisations`);
    expect(rows).toHaveLength(0);
  });
});
