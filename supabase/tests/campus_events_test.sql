-- campus_events_test.sql
--
-- Run this once after applying the migrations, in the Supabase SQL editor or
-- with psql. It proves the event system behaves as the handoff requires:
-- the hash chain links up, history cannot be edited or deleted, roles cannot
-- record events outside their remit, and one campus cannot write into another.
--
-- Everything happens inside a transaction that is rolled back at the end, so
-- no test data survives. A failure raises, which aborts the transaction, so a
-- failed run leaves nothing behind either.
--
-- Expected final output: NOTICE lines ending in "ALL CHECKS PASSED".

begin;

do $test$
declare
  v_instance   uuid := '00000000-0000-0000-0000-000000000000';
  v_uni_a      uuid;
  v_uni_b      uuid;
  v_dept       uuid;
  v_student    uuid;
  v_gate       uuid;
  v_other_gate uuid;
  v_staff      uuid := gen_random_uuid();
  v_role_id    uuid;
  v_first      public.campus_events%rowtype;
  v_second     public.campus_events%rowtype;
  v_third      public.campus_events%rowtype;
  v_status     jsonb;
  v_recomputed text;
  v_failed     boolean;
begin
  ---------------------------------------------------------------------------
  -- Fixtures. Two universities, so tenant isolation can be tested for real.
  ---------------------------------------------------------------------------
  insert into public.universities (code, name, short_name)
  values ('TEST-A', 'Test University A', 'TUA')
  returning id into v_uni_a;

  insert into public.universities (code, name, short_name)
  values ('TEST-B', 'Test University B', 'TUB')
  returning id into v_uni_b;

  insert into public.departments (university_id, code, name)
  values (v_uni_a, 'TSTD', 'Test Department')
  returning id into v_dept;

  insert into public.people (university_id, person_code, full_name, department_id)
  values (v_uni_a, 'TEST-0001', 'Test Student', v_dept)
  returning id into v_student;

  insert into public.campus_locations (university_id, code, name, type)
  values (v_uni_a, 'TEST-GATE', 'Test Gate', 'gate')
  returning id into v_gate;

  insert into public.campus_locations (university_id, code, name, type)
  values (v_uni_b, 'TEST-GATE-B', 'Other Campus Gate', 'gate')
  returning id into v_other_gate;

  insert into auth.users (id, instance_id, aud, role, email)
  values (v_staff, v_instance, 'authenticated', 'authenticated', 'chain-test@example.invalid');

  insert into public.app_users (id, university_id, full_name, email)
  values (v_staff, v_uni_a, 'Test Admin', 'chain-test@example.invalid');

  insert into public.user_roles (user_id, university_id, role)
  values (v_staff, v_uni_a, 'university_admin')
  returning id into v_role_id;

  -- Everything below runs as that person, the way a request would.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text,
    true
  );

  ---------------------------------------------------------------------------
  -- 1. Three events, sealed by the trigger.
  ---------------------------------------------------------------------------
  v_first := public.record_campus_event(
    'IDENTITY_VERIFIED', 'VALID', v_student, v_gate,
    null, null, '{"source":"test"}'::jsonb
  );
  v_second := public.record_campus_event(
    'LIBRARY_ENTRY', 'SUCCESS', v_student, v_gate,
    null, null, '{}'::jsonb, now(), true
  );
  v_third := public.record_campus_event(
    'IDENTITY_REJECTED', 'REVOKED', v_student, v_gate
  );

  if v_first.seq <> 1 or v_second.seq <> 2 or v_third.seq <> 3 then
    raise exception 'FAIL: chain positions are % % %', v_first.seq, v_second.seq, v_third.seq;
  end if;
  raise notice 'PASS: events take consecutive chain positions';

  if v_first.prev_hash <> repeat('0', 64) then
    raise exception 'FAIL: the first event should point at the zero hash, got %', v_first.prev_hash;
  end if;
  raise notice 'PASS: the chain starts from the genesis hash';

  if v_second.prev_hash <> v_first.event_hash or v_third.prev_hash <> v_second.event_hash then
    raise exception 'FAIL: events are not linked to the one before them';
  end if;
  raise notice 'PASS: each event carries the hash of the one before it';

  ---------------------------------------------------------------------------
  -- 2. A system-attributed event has no human actor but stays traceable.
  ---------------------------------------------------------------------------
  if v_second.actor_id is not null then
    raise exception 'FAIL: a turnstile event should have no actor';
  end if;
  if v_second.metadata ->> 'system_operator_id' <> v_staff::text then
    raise exception 'FAIL: the operator behind the turnstile was not recorded';
  end if;
  raise notice 'PASS: machine events record the operator in metadata, not as the actor';

  ---------------------------------------------------------------------------
  -- 3. The stored hash is reproducible from the stored record.
  ---------------------------------------------------------------------------
  select public.campus_event_hash(
    e.prev_hash, e.seq, e.university_id, e.event_type, e.person_id, e.actor_id,
    e.actor_role, e.location_id, e.entity_type, e.entity_id, e.result,
    e.metadata, e.occurred_at
  )
  into v_recomputed
  from public.campus_events e
  where e.id = v_first.id;

  if v_recomputed <> v_first.event_hash then
    raise exception 'FAIL: the stored hash does not reproduce';
  end if;
  raise notice 'PASS: a stored event re-hashes to its stored value';

  v_status := public.campus_event_chain_status(v_uni_a);
  if v_status ->> 'status' <> 'UNBROKEN' or (v_status ->> 'events')::int <> 3 then
    raise exception 'FAIL: chain status reported %', v_status;
  end if;
  raise notice 'PASS: the chain verifies as UNBROKEN';

  ---------------------------------------------------------------------------
  -- 4. History is append only.
  ---------------------------------------------------------------------------
  v_failed := false;
  begin
    update public.campus_events set result = 'VALID' where id = v_third.id;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL: an event was updated';
  end if;
  raise notice 'PASS: events cannot be updated';

  v_failed := false;
  begin
    delete from public.campus_events where id = v_third.id;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL: an event was deleted';
  end if;
  raise notice 'PASS: events cannot be deleted';

  ---------------------------------------------------------------------------
  -- 5. A location on another campus cannot be written to.
  ---------------------------------------------------------------------------
  v_failed := false;
  begin
    perform public.record_campus_event(
      'IDENTITY_VERIFIED', 'VALID', v_student, v_other_gate
    );
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL: an event was recorded against another university';
  end if;
  raise notice 'PASS: another campus cannot be written to';

  ---------------------------------------------------------------------------
  -- 6. A guard cannot record library activity.
  ---------------------------------------------------------------------------
  update public.user_roles set role = 'guard' where id = v_role_id;

  v_failed := false;
  begin
    perform public.record_campus_event('BOOK_ISSUED', 'SUCCESS', v_student, v_gate);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL: a guard recorded a book issue';
  end if;
  raise notice 'PASS: a guard cannot record library activity';

  if public.record_campus_event('IDENTITY_VERIFIED', 'VALID', v_student, v_gate) is null then
    raise exception 'FAIL: a guard could not record an identity verification';
  end if;
  raise notice 'PASS: a guard can still record identity verifications';

  raise notice '--- ALL CHECKS PASSED ---';
end;
$test$;

rollback;
