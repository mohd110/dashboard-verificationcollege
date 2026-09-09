-- 0105_campus_row_level_security.sql
--
-- OWNER: Mammu.
--
-- Only the two tables this subsystem owns are touched: campus_events and
-- campus_locations. People, cards, credentials, books and notifications belong
-- to Saif and Tabish and are left exactly as they are.
--
-- READ THIS BEFORE APPLYING, because it changes behaviour for other code:
--
--   1. campus_events is currently readable by the anon role. That is closed
--      here. Anything reading it without a signed-in session will stop.
--   2. campus_events gets row level security with no insert policy, so a
--      direct insert from a client session is refused. A SECURITY DEFINER
--      function is unaffected, so the library subsystem keeps working if it
--      writes through one. If it inserts from the client instead, it has to
--      move to record_campus_event(), which is the agreed write path anyway.
--
-- Update and delete stay blocked by the trigger in 0101, which no policy and
-- no privilege can talk its way past.

alter table public.campus_events    enable row level security;
alter table public.campus_locations enable row level security;

-- ---------------------------------------------------------------------------
-- Campus locations. Everyone signed in reads them, administrators maintain
-- them. Deletion is not offered: a location referenced by history must stay.
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
revoke all on public.campus_locations from anon;

-- ---------------------------------------------------------------------------
-- Campus events.
--
-- Read: administrators see the whole tenant. A guard or librarian sees only
-- the activity they recorded themselves, which is enough to confirm their own
-- scan landed and nothing more. Machine-attributed events have no actor, so
-- the operator who drove the reader is matched through the metadata instead.
--
-- Write: no policy, by design. record_campus_event() is SECURITY DEFINER and
-- is unaffected.
-- ---------------------------------------------------------------------------
drop policy if exists campus_events_read on public.campus_events;
create policy campus_events_read on public.campus_events
  for select to authenticated
  using (
    university_id = public.current_university_id()
    and (
      public.current_user_is_admin()
      or actor_id = public.current_app_user_id()
      or metadata ->> 'system_operator_id' = public.current_app_user_id()::text
    )
  );

revoke all on public.campus_events from anon;
revoke insert, update, delete on public.campus_events from authenticated;
