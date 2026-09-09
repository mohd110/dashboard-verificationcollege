-- 0006_event_integrity.sql
--
-- OWNER: Mammu.
--
-- Re-derives every stored hash and compares it with what the chain says it
-- should be. This is the honest alternative to a blockchain claim: the history
-- is tamper evident, and nothing here pretends it is anchored anywhere.

-- ---------------------------------------------------------------------------
-- Row-by-row check for one university.
--
-- SECURITY DEFINER, because a broken chain has to be detectable even where a
-- policy would hide rows: an attacker who could hide their own row from the
-- verifier could hide the break as well. The tenant and role checks below are
-- what keep that safe.
-- ---------------------------------------------------------------------------
create or replace function public.verify_campus_event_chain(p_university_id uuid)
returns table (
  seq           bigint,
  event_id      uuid,
  occurred_at   timestamptz,
  event_type    public.campus_event_type,
  prev_hash_ok  boolean,
  event_hash_ok boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.current_user_is_admin() then
    raise exception 'only an administrator may verify the event chain';
  end if;

  if p_university_id is distinct from public.current_university_id() then
    raise exception 'cannot verify the event chain of another university';
  end if;

  return query
  with ordered as (
    select
      e.*,
      lag(e.event_hash) over (order by e.seq) as expected_prev
    from public.campus_events e
    where e.university_id = p_university_id
  )
  select
    o.seq,
    o.id,
    o.occurred_at,
    o.event_type,
    o.prev_hash = coalesce(o.expected_prev, repeat('0', 64)),
    o.event_hash = public.campus_event_hash(
      o.prev_hash, o.seq, o.university_id, o.event_type, o.person_id,
      o.actor_id, o.actor_role, o.location_id, o.entity_type, o.entity_id,
      o.result, o.metadata, o.occurred_at
    )
  from ordered o
  order by o.seq;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- One-line summary for the Integrity page.
-- ---------------------------------------------------------------------------
create or replace function public.campus_event_chain_status(p_university_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_total      bigint;
  v_first_bad  bigint;
  v_head_hash  text;
begin
  if not public.current_user_is_admin() then
    raise exception 'only an administrator may verify the event chain';
  end if;

  if p_university_id is distinct from public.current_university_id() then
    raise exception 'cannot verify the event chain of another university';
  end if;

  select count(*), min(c.seq) filter (where not (c.prev_hash_ok and c.event_hash_ok))
    into v_total, v_first_bad
  from public.verify_campus_event_chain(p_university_id) c;

  select e.event_hash into v_head_hash
  from public.campus_events e
  where e.university_id = p_university_id
  order by e.seq desc
  limit 1;

  return jsonb_build_object(
    'events', v_total,
    'status', case when v_first_bad is null then 'UNBROKEN' else 'BROKEN' end,
    'first_broken_seq', v_first_bad,
    'head_hash', v_head_hash,
    'checked_at', now()
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Integrity of a single event, for the event detail panel.
--
-- Invoker rights on purpose: the caller only ever sees events their own
-- policies already let them read.
-- ---------------------------------------------------------------------------
create or replace function public.verify_campus_event(p_event_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_event    public.campus_events%rowtype;
  v_expected text;
  v_prev     text;
  v_prev_ok  boolean;
begin
  select * into v_event from public.campus_events where id = p_event_id;

  if v_event.id is null then
    return jsonb_build_object('found', false);
  end if;

  v_expected := public.campus_event_hash(
    v_event.prev_hash, v_event.seq, v_event.university_id, v_event.event_type,
    v_event.person_id, v_event.actor_id, v_event.actor_role, v_event.location_id,
    v_event.entity_type, v_event.entity_id, v_event.result, v_event.metadata,
    v_event.occurred_at
  );

  select e.event_hash into v_prev
  from public.campus_events e
  where e.university_id = v_event.university_id and e.seq = v_event.seq - 1;

  v_prev_ok := v_event.prev_hash = coalesce(v_prev, repeat('0', 64));

  return jsonb_build_object(
    'found', true,
    'seq', v_event.seq,
    'event_hash', v_event.event_hash,
    'prev_hash', v_event.prev_hash,
    'event_hash_ok', v_event.event_hash = v_expected,
    'prev_hash_ok', v_prev_ok,
    'record_integrity',
      case when v_event.event_hash = v_expected and v_prev_ok
        then 'VALID' else 'INVALID' end
  );
end;
$fn$;

grant execute on function public.verify_campus_event_chain(uuid) to authenticated;
grant execute on function public.campus_event_chain_status(uuid) to authenticated;
grant execute on function public.verify_campus_event(uuid) to authenticated;
