-- 0005_campus_events.sql
--
-- OWNER: Mammu.
--
-- The single campus activity log. Saif writes identity verifications into it,
-- Tabish writes book and notification activity into it. Nobody creates a
-- second activity table.
--
-- Integrity follows the credential event pattern: every row carries the hash
-- of the row before it, so a silent edit anywhere in the history breaks the
-- chain from that point on. Sealing happens in a BEFORE INSERT trigger, which
-- means an application cannot choose its own hashes.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'campus_event_type') then
    create type public.campus_event_type as enum (
      'IDENTITY_VERIFIED',
      'IDENTITY_REJECTED',
      'LIBRARY_ENTRY',
      'BOOK_ISSUED',
      'BOOK_RETURNED',
      'NOTIFICATION_SENT',
      'CARD_ISSUED',
      'CARD_BLOCKED'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'campus_event_result') then
    create type public.campus_event_result as enum (
      'VALID',
      'INVALID',
      'REVOKED',
      'EXPIRED',
      'SUCCESS',
      'FAILED',
      'SENT'
    );
  end if;
end
$$;

create table if not exists public.campus_events (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete restrict,
  event_type    public.campus_event_type not null,
  person_id     uuid references public.people (id) on delete restrict,
  actor_id      uuid references public.app_users (id) on delete restrict,
  actor_role    public.app_role,
  location_id   uuid references public.campus_locations (id) on delete restrict,
  entity_type   text,
  entity_id     uuid,
  result        public.campus_event_result not null,
  metadata      jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now(),
  seq           bigint not null,
  prev_hash     text not null,
  event_hash    text not null,
  created_at    timestamptz not null default now(),
  unique (university_id, seq)
);

create index if not exists campus_events_person_idx
  on public.campus_events (person_id, occurred_at desc);
create index if not exists campus_events_university_time_idx
  on public.campus_events (university_id, occurred_at desc);
create index if not exists campus_events_type_idx
  on public.campus_events (university_id, event_type, occurred_at desc);

comment on table public.campus_events is
  'Append-only campus activity log. Insert only through record_campus_event().';

-- ---------------------------------------------------------------------------
-- Hash of one event. Used both when sealing a new row and when re-checking an
-- old one, so there is exactly one definition of what a correct hash is.
--
-- Every field is coalesced because concat_ws drops nulls outright, which would
-- let two different events collapse to the same input string.
-- ---------------------------------------------------------------------------
create or replace function public.campus_event_hash(
  p_prev_hash     text,
  p_seq           bigint,
  p_university_id uuid,
  p_event_type    public.campus_event_type,
  p_person_id     uuid,
  p_actor_id      uuid,
  p_actor_role    public.app_role,
  p_location_id   uuid,
  p_entity_type   text,
  p_entity_id     uuid,
  p_result        public.campus_event_result,
  p_metadata      jsonb,
  p_occurred_at   timestamptz
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select encode(
    digest(
      concat_ws(
        '|',
        p_prev_hash,
        p_seq::text,
        p_university_id::text,
        p_event_type::text,
        coalesce(p_person_id::text, ''),
        coalesce(p_actor_id::text, ''),
        coalesce(p_actor_role::text, ''),
        coalesce(p_location_id::text, ''),
        coalesce(p_entity_type, ''),
        coalesce(p_entity_id::text, ''),
        p_result::text,
        coalesce(p_metadata, '{}'::jsonb)::text,
        to_char(p_occurred_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US')
      ),
      'sha256'
    ),
    'hex'
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Sealing trigger. The advisory lock serialises inserts per university so two
-- concurrent writers cannot claim the same chain position.
-- ---------------------------------------------------------------------------
create or replace function public.campus_events_seal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_prev_seq  bigint;
  v_prev_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.university_id::text, 0));

  select seq, event_hash
    into v_prev_seq, v_prev_hash
  from public.campus_events
  where university_id = new.university_id
  order by seq desc
  limit 1;

  new.seq        := coalesce(v_prev_seq, 0) + 1;
  new.prev_hash  := coalesce(v_prev_hash, repeat('0', 64));
  new.metadata   := coalesce(new.metadata, '{}'::jsonb);
  new.created_at := now();
  new.event_hash := public.campus_event_hash(
    new.prev_hash, new.seq, new.university_id, new.event_type, new.person_id,
    new.actor_id, new.actor_role, new.location_id, new.entity_type,
    new.entity_id, new.result, new.metadata, new.occurred_at
  );

  return new;
end;
$fn$;

drop trigger if exists campus_events_seal on public.campus_events;
create trigger campus_events_seal
  before insert on public.campus_events
  for each row execute function public.campus_events_seal();

-- ---------------------------------------------------------------------------
-- Append only. Revoking the privilege alone is not enough, because the table
-- owner and any SECURITY DEFINER function would still bypass it.
-- ---------------------------------------------------------------------------
create or replace function public.campus_events_block_mutation()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'campus_events is append only: % is not permitted', tg_op;
end;
$fn$;

drop trigger if exists campus_events_no_mutation on public.campus_events;
create trigger campus_events_no_mutation
  before update or delete on public.campus_events
  for each row execute function public.campus_events_block_mutation();

-- ---------------------------------------------------------------------------
-- Which roles may record which events. A guard posted to a gate cannot write
-- library or card activity.
-- ---------------------------------------------------------------------------
create or replace function public.role_may_record_event(
  p_role public.app_role,
  p_event_type public.campus_event_type
)
returns boolean
language sql
immutable
as $fn$
  select case p_role
    when 'super_admin' then true
    when 'university_admin' then true
    when 'guard' then p_event_type in (
      'IDENTITY_VERIFIED', 'IDENTITY_REJECTED', 'LIBRARY_ENTRY')
    when 'verifier' then p_event_type in (
      'IDENTITY_VERIFIED', 'IDENTITY_REJECTED', 'LIBRARY_ENTRY')
    when 'librarian' then p_event_type in (
      'IDENTITY_VERIFIED', 'IDENTITY_REJECTED', 'LIBRARY_ENTRY',
      'BOOK_ISSUED', 'BOOK_RETURNED', 'NOTIFICATION_SENT')
    when 'issuer_officer' then p_event_type in ('CARD_ISSUED', 'CARD_BLOCKED')
    else false
  end;
$fn$;

-- ---------------------------------------------------------------------------
-- The only supported way to write an event.
--
-- Tenant and actor come from the session, never from the caller's arguments.
-- That is what stops a client writing activity into another university or
-- under somebody else's name.
-- ---------------------------------------------------------------------------
create or replace function public.record_campus_event(
  p_event_type    public.campus_event_type,
  p_result        public.campus_event_result,
  p_person_id     uuid default null,
  p_location_id   uuid default null,
  p_entity_type   text default null,
  p_entity_id     uuid default null,
  p_metadata      jsonb default '{}'::jsonb,
  p_occurred_at   timestamptz default now(),
  p_system_actor  boolean default false
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
  v_metadata jsonb   := coalesce(p_metadata, '{}'::jsonb);
  v_event    public.campus_events%rowtype;
begin
  select * into v_user from public.app_users where id = auth.uid();

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

  -- A turnstile and a mailer have no human actor, so those events are attributed
  -- to the system. The session that drove the machine is still recorded in the
  -- metadata, so the trail stays complete.
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
    case when p_system_actor then null else v_role end,
    p_location_id,
    p_entity_type,
    p_entity_id,
    p_result,
    v_metadata,
    p_occurred_at
  )
  returning * into v_event;

  return v_event;
end;
$fn$;

revoke all on function public.record_campus_event(
  public.campus_event_type, public.campus_event_result, uuid, uuid, text, uuid,
  jsonb, timestamptz, boolean
) from public;

grant execute on function public.record_campus_event(
  public.campus_event_type, public.campus_event_result, uuid, uuid, text, uuid,
  jsonb, timestamptz, boolean
) to authenticated;
