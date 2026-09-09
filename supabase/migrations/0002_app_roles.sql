-- 0002_app_roles.sql
--
-- OWNER: Mammu.
--
-- app_role reproduces the eight baseline staff roles described in the handoff
-- and adds the two the demo needs: guard and librarian. If the live database
-- already declares app_role, delete the create block and keep only the two
-- `alter type` statements.
--
-- This file contains nothing but the enum. PostgreSQL refuses to use an enum
-- value in the same transaction that added it, and Supabase runs one
-- transaction per migration file, so everything that reads 'guard' or
-- 'librarian' has to live in a later file.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'super_admin',
      'university_admin',
      'registrar',
      'department_admin',
      'issuer_officer',
      'verifier',
      'staff',
      'student'
    );
  end if;
end
$$;

alter type public.app_role add value if not exists 'guard';
alter type public.app_role add value if not exists 'librarian';
