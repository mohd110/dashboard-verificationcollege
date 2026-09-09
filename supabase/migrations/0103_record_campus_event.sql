-- 0103_record_campus_event.sql
--
-- OWNER: Mammu.
--
-- The supported way to write an event. Saif's verification flow and Tabish's
-- library flow both come through here, which is what stops three separate
-- activity systems appearing.
--
-- event_type and result are text columns in this database, so the vocabulary
-- is enforced in this function rather than by a CHECK constraint. A constraint
-- would reject rows the library subsystem may already be writing, and breaking
-- somebody else's working code is not the job.

-- ---------------------------------------------------------------------------
-- The agreed vocabulary.
-- ---------------------------------------------------------------------------
create or replace function public.campus_event_types()
returns text[]
language sql
immutable
as $fn$
  select array[
    'IDENTITY_VERIFIED', 'IDENTITY_REJECTED', 'LIBRARY_ENTRY',
    'BOOK_ISSUED', 'BOOK_RETURNED', 'NOTIFICATION_SENT',
    'CARD_ISSUED', 'CARD_BLOCKED'
  ];
$fn$;

create or replace function public.campus_event_results()
returns text[]
language sql
immutable
as $fn$
  select array['VALID', 'INVALID', 'REVOKED', 'EXPIRED', 'SUCCESS', 'FAILED', 'SENT'];
$fn$;

-- ---------------------------------------------------------------------------
-- Which roles may record which events. A guard posted to a gate cannot write
-- library or card activity.
-- ---------------------------------------------------------------------------
create or replace function public.role_may_record_event(
  p_role public.app_role,
  p_event_type text
)
returns boolean
language sql
immutable
as $fn$
  select case p_role
    when 'platform_admin' then true
    when 'university_admin' then true
    when 'guard' then p_event_type in (
      'IDENTITY_VERIFIED', 'IDENTITY_REJECTED', 'LIBRARY_ENTRY')
    when 'verifier' then p_event_type in (
      'IDENTITY_VERIFIED', 'IDENTITY_REJECTED', 'LIBRARY_ENTRY')
    when 'librarian' then p_event_type in (
      'IDENTITY_VERIFIED', 'IDENTITY_REJECTED', 'LIBRARY_ENTRY',
      'BOOK_ISSUED', 'BOOK_RETURNED', 'NOTIFICATION_SENT')
    when 'card_operator' then p_event_type in ('CARD_ISSUED', 'CARD_BLOCKED')
    when 'revocation_officer' then p_event_type = 'CARD_BLOCKED'
    else false
  end;
$fn$;

-- ---------------------------------------------------------------------------
-- Tenant and actor come from the session, never from the caller's arguments.
-- That is what stops a client writing activity into another university or
-- under somebody else's name.
-- ---------------------------------------------------------------------------
create or replace function public.record_campus_event(
  p_event_type   text,
  p_result       text,
  p_person_id    uuid default null,
  p_location_id  uuid default null,
  p_entity_type  text default null,
  p_entity_id    uuid default null,
  p_metadata     jsonb default '{}'::jsonb,
  p_occurred_at  timestamptz default now(),
  p_system_actor boolean default false
)
returns public.campus_events
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_user     public.app_users%rowtype;
  v_location public.campus_locations%rowtype;
  v_role     public.app_role;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_event    public.campus_events%rowtype;
begin
  if not (p_event_type = any (public.campus_event_types())) then
    raise exception '% is not a campus event type', p_event_type;
  end if;

  if not (p_result = any (public.campus_event_results())) then
    raise exception '% is not a campus event result', p_result;
  end if;

  select * into v_user
  from public.app_users
  where auth_user_id = auth.uid();

  if v_user.id is null then
    raise exception 'no staff account is signed in';
  end if;

  if v_user.status <> 'active' then
    raise exception 'this staff account is deactivated';
  end if;

  v_role := public.current_user_role();

  if v_role is null or not public.role_may_record_event(v_role, p_event_type) then
    raise exception 'role % may not record % events',
      coalesce(v_role::text, 'none'), p_event_type;
  end if;

  if p_location_id is not null then
    select * into v_location
    from public.campus_locations
    where id = p_location_id;

    if v_location.id is null or v_location.university_id <> v_user.university_id then
      raise exception 'location does not belong to this university';
    end if;

    if v_location.status <> 'active' then
      raise exception 'location % is not active', v_location.name;
    end if;
  end if;

  if p_person_id is not null and not exists (
    select 1 from public.people
    where id = p_person_id and university_id = v_user.university_id
  ) then
    raise exception 'person does not belong to this university';
  end if;

  -- A turnstile and a mailer have no human actor, so those events are
  -- attributed to the system. The session that drove the machine is still
  -- recorded, so the trail stays complete.
  if p_system_actor then
    if p_event_type not in ('LIBRARY_ENTRY', 'NOTIFICATION_SENT') then
      raise exception '% must be attributed to a person, not the system', p_event_type;
    end if;
    v_metadata := v_metadata || jsonb_build_object('system_operator_id', v_user.id);
  end if;

  insert into public.campus_events (
    university_id, event_type, person_id, actor_id, actor_role,
    location_id, entity_type, entity_id, result, metadata, occurred_at
  )
  values (
    v_user.university_id,
    p_event_type,
    p_person_id,
    case when p_system_actor then null else v_user.id end,
    case when p_system_actor then null else v_role::text end,
    p_location_id,
    p_entity_type,
    p_entity_id,
    p_result,
    v_metadata,
    coalesce(p_occurred_at, now())
  )
  returning * into v_event;

  return v_event;
end;
$fn$;

revoke all on function public.record_campus_event(
  text, text, uuid, uuid, text, uuid, jsonb, timestamptz, boolean
) from public;

grant execute on function public.record_campus_event(
  text, text, uuid, uuid, text, uuid, jsonb, timestamptz, boolean
) to authenticated;

grant execute on function public.campus_event_types() to authenticated;
grant execute on function public.campus_event_results() to authenticated;
