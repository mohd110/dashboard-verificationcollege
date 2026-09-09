-- 0100_campus_roles.sql
--
-- OWNER: Mammu.
--
-- The live database already declares app_role with the eight roles the handoff
-- describes: platform_admin, university_admin, registrar, department_admin,
-- card_operator, revocation_officer, verifier, auditor. Nothing is removed or
-- renamed here. The demo needs two more.
--
-- This file contains nothing else on purpose. PostgreSQL refuses to use an
-- enum value in the same transaction that added it, and Supabase runs one
-- transaction per migration file, so everything that reads 'guard' or
-- 'librarian' has to live in a later file.

alter type public.app_role add value if not exists 'guard';
alter type public.app_role add value if not exists 'librarian';
