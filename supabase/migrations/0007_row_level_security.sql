-- 0007_row_level_security.sql
--
-- OWNER: Mammu.
--
-- Every table is tenant scoped through current_university_id(), which reads the
-- signed-in staff account rather than anything the client sends.
--
-- Writes that need to cross a tenant boundary or touch auth.users (creating a
-- staff account, for instance) are done server side with the service role key
-- and are not expressible through these policies at all.

alter table public.universities     enable row level security;
alter table public.departments      enable row level security;
alter table public.people           enable row level security;
alter table public.enrolments       enable row level security;
alter table public.app_users        enable row level security;
alter table public.user_roles       enable row level security;
alter table public.campus_locations enable row level security;
alter table public.campus_events    enable row level security;

-- ---------------------------------------------------------------------------
-- Reference data: readable inside the tenant, never writable from a session.
-- The student registry is maintained upstream, not from this dashboard.
-- ---------------------------------------------------------------------------
drop policy if exists universities_read on public.universities;
create policy universities_read on public.universities
  for select to authenticated
  using (id = public.current_university_id());

drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments
  for select to authenticated
  using (university_id = public.current_university_id());

drop policy if exists people_read on public.people;
create policy people_read on public.people
  for select to authenticated
  using (university_id = public.current_university_id());

drop policy if exists enrolments_read on public.enrolments;
create policy enrolments_read on public.enrolments
  for select to authenticated
  using (university_id = public.current_university_id());

-- ---------------------------------------------------------------------------
-- Staff accounts. A member of staff can see their own record; only an
-- administrator sees or changes the rest of the tenant.
-- ---------------------------------------------------------------------------
drop policy if exists app_users_read on public.app_users;
create policy app_users_read on public.app_users
  for select to authenticated
  using (
    id = auth.uid()
    or (public.current_user_is_admin() and university_id = public.current_university_id())
  );

drop policy if exists app_users_admin_update on public.app_users;
create policy app_users_admin_update on public.app_users
  for update to authenticated
  using (public.current_user_is_admin() and university_id = public.current_university_id())
  with check (university_id = public.current_university_id());

drop policy if exists user_roles_read on public.user_roles;
create policy user_roles_read on public.user_roles
  for select to authenticated
  using (
    user_id = auth.uid()
    or (public.current_user_is_admin() and university_id = public.current_university_id())
  );

drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using (public.current_user_is_admin() and university_id = public.current_university_id())
  with check (public.current_user_is_admin() and university_id = public.current_university_id());

-- ---------------------------------------------------------------------------
-- Campus locations. Everyone signed in reads them, administrators maintain them.
-- Deletion is not offered: a location referenced by history must stay.
-- ---------------------------------------------------------------------------
drop policy if exists campus_locations_read on public.campus_locations;
create policy campus_locations_read on public.campus_locations
  for select to authenticated
  using (university_id = public.current_university_id());

drop policy if exists campus_locations_admin_insert on public.campus_locations;
create policy campus_locations_admin_insert on public.campus_locations
  for insert to authenticated
  with check (public.current_user_is_admin() and university_id = public.current_university_id());

drop policy if exists campus_locations_admin_update on public.campus_locations;
create policy campus_locations_admin_update on public.campus_locations
  for update to authenticated
  using (public.current_user_is_admin() and university_id = public.current_university_id())
  with check (university_id = public.current_university_id());

revoke delete on public.campus_locations from authenticated;

-- ---------------------------------------------------------------------------
-- Campus events.
--
-- Read: administrators see the whole tenant. A guard or librarian sees only the
-- activity they recorded themselves, which is enough to confirm their own scan
-- landed and nothing more. Machine-attributed events have no actor, so the
-- operator who drove the reader is matched through the metadata instead.
--
-- Write: no policy exists, and the privileges are revoked outright. The only
-- way in is record_campus_event(), which seals the hash chain. Update and
-- delete are additionally blocked by trigger in 0005.
-- ---------------------------------------------------------------------------
drop policy if exists campus_events_read on public.campus_events;
create policy campus_events_read on public.campus_events
  for select to authenticated
  using (
    university_id = public.current_university_id()
    and (
      public.current_user_is_admin()
      or actor_id = auth.uid()
      or metadata ->> 'system_operator_id' = auth.uid()::text
    )
  );

revoke insert, update, delete on public.campus_events from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Nothing in this schema is public.
-- ---------------------------------------------------------------------------
revoke all on public.universities, public.departments, public.people,
  public.enrolments, public.app_users, public.user_roles,
  public.campus_locations, public.campus_events from anon;
