-- 0101_campus_event_chain.sql
--
-- OWNER: Mammu.
--
-- campus_events already exists with prev_hash and event_hash columns, but
-- nothing fills them and nothing orders the chain. This file makes the table
-- tamper evident without changing a single existing column.
--
-- What it adds:
--   seq, the chain position, filled by a trigger
--   campus_event_hash(), one definition of a correct hash
--   a BEFORE INSERT trigger that seals every row, whoever inserts it
--   a trigger that refuses updates and deletes
--
-- Sealing on insert rather than in application code matters here, because the
-- library subsystem writes to this table through its own functions. Those keep
-- working and their rows get chained too.

-- sha256 comes from pgcrypto. A no-op where it is already installed, which on
-- a Supabase project usually means the extensions schema.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Chain position.
-- ---------------------------------------------------------------------------
alter table public.campus_events
  add column if not exists seq bigint;

-- ---------------------------------------------------------------------------
-- The hash of one event, used both when sealing a new row and when re-checking
-- an old one, so there is exactly one definition of what a correct hash is.
--
-- Every field is coalesced because concat_ws drops nulls outright, which would
-- let two different events collapse to the same input string.
--
-- event_type, actor_role and result are text in this database rather than
-- enums, so they are hashed as text.
-- ---------------------------------------------------------------------------
create or replace function public.campus_event_hash(
  p_prev_hash     text,
  p_seq           bigint,
  p_university_id uuid,
  p_event_type    text,
  p_person_id     uuid,
  p_actor_id      uuid,
  p_actor_role    text,
  p_location_id   uuid,
  p_entity_type   text,
  p_entity_id     uuid,
  p_result        text,
  p_metadata      jsonb,
  p_occurred_at   timestamptz
)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $fn$
  select encode(
    digest(
      concat_ws(
        '|',
        p_prev_hash,
        p_seq::text,
        p_university_id::text,
        p_event_type,
        coalesce(p_person_id::text, ''),
        coalesce(p_actor_id::text, ''),
        coalesce(p_actor_role, ''),
        coalesce(p_location_id::text, ''),
        coalesce(p_entity_type, ''),
        coalesce(p_entity_id::text, ''),
        p_result,
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
set search_path = public, extensions, pg_temp
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
  new.occurred_at := coalesce(new.occurred_at, now());
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
-- Any row that predates the trigger gets a position and a hash, so the chain
-- has a single unbroken definition rather than a gap at the front.
-- ---------------------------------------------------------------------------
do $backfill$
declare
  v_row       record;
  v_prev_hash text;
  v_prev_uni  uuid;
  v_seq       bigint;
begin
  for v_row in
    select * from public.campus_events
    where seq is null
    order by university_id, occurred_at, created_at, id
  loop
    if v_prev_uni is distinct from v_row.university_id then
      select coalesce(max(seq), 0) into v_seq
      from public.campus_events where university_id = v_row.university_id;

      select event_hash into v_prev_hash
      from public.campus_events
      where university_id = v_row.university_id and seq = v_seq;

      v_prev_uni := v_row.university_id;
    end if;

    v_seq := v_seq + 1;
    v_prev_hash := coalesce(v_prev_hash, repeat('0', 64));

    update public.campus_events
    set seq = v_seq,
        prev_hash = v_prev_hash,
        event_hash = public.campus_event_hash(
          v_prev_hash, v_seq, v_row.university_id, v_row.event_type,
          v_row.person_id, v_row.actor_id, v_row.actor_role, v_row.location_id,
          v_row.entity_type, v_row.entity_id, v_row.result,
          coalesce(v_row.metadata, '{}'::jsonb), v_row.occurred_at
        )
    where id = v_row.id;

    select event_hash into v_prev_hash from public.campus_events where id = v_row.id;
  end loop;
end
$backfill$;

alter table public.campus_events
  alter column seq set not null;

create unique index if not exists campus_events_university_seq_key
  on public.campus_events (university_id, seq);

create index if not exists campus_events_person_idx
  on public.campus_events (person_id, occurred_at desc);
create index if not exists campus_events_university_time_idx
  on public.campus_events (university_id, occurred_at desc);
create index if not exists campus_events_type_idx
  on public.campus_events (university_id, event_type, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Append only. Revoking the privilege alone would not be enough, because the
-- table owner and any SECURITY DEFINER function would still bypass it.
--
-- This runs last, so the backfill above can still write.
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

comment on table public.campus_events is
  'Append-only campus activity log, hash chained per university. Prefer record_campus_event() for writes.';
