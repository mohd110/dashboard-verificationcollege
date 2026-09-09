-- campus_events_test.sql
--
-- Run this once after applying migrations 0100 to 0105. It proves the event
-- system behaves as the handoff requires: the hash chain links up, history
-- cannot be edited or deleted, roles cannot record events outside their remit,
-- and one campus cannot write into another.
--
-- Everything happens inside a transaction that is rolled back at the end, so no
-- test data survives and nothing anybody else is working on is disturbed. A
-- failed check raises, which aborts the transaction, so a failed run leaves
-- nothing behind either.
--
-- It creates one temporary staff account and nothing else. Universities,
-- locations and students are read from what is already there rather than
-- invented, so the script does not have to guess at anybody else's constraints.
--
-- Expected final output: NOTICE lines ending in "ALL CHECKS PASSED".

begin;

do $test$
declare
  v_uni        uuid;
  v_other_uni  uuid;
  v_location   uuid;
  v_student    uuid;
  v_outsider   uuid;
  v_auth_uid   uuid := gen_random_uuid();
  v_staff      uuid;
  v_role_id    uuid;
  v_first      public.campus_events%rowtype;
  v_second     public.campus_events%rowtype;
  v_third      public.campus_events%rowtype;
  v_status     jsonb;
  v_recomputed text;
  v_failed     boolean;
begin
  ---------------------------------------------------------------------------
  -- Pick a campus that has somewhere to scan and somebody to scan.
  ---------------------------------------------------------------------------
  select l.university_id, l.id into v_uni, v_location
  from public.campus_locations l
  where l.status = 'active'
  order by l.code
  limit 1;

  if v_uni is null then
    raise exception 'FAIL: no active campus location to test against';
  end if;

  select id into v_student
  from public.people
  where university_id = v_uni and role = 'student' and status = 'active'
  limit 1;

  if v_student is null then
    raise exception 'FAIL: no active student on that campus';
  end if;

  select id into v_other_uni from public.universities where id <> v_uni limit 1;
  select id into v_outsider
  from public.people where university_id = v_other_uni limit 1;

  ---------------------------------------------------------------------------
  -- One temporary member of staff. app_users.auth_user_id has no foreign key
  -- to auth.users, so no login has to be created to impersonate a session.
  ---------------------------------------------------------------------------
  insert into public.app_users (university_id, display_name, status, auth_user_id)
  values (v_uni, 'Chain test account', 'active', v_auth_uid)
  returning id into v_staff;

  insert into public.user_roles (user_id, role, scope_type, scope_id)
  values (v_staff, 'university_admin', 'university', v_uni)
  returning id into v_role_id;

  -- Everything below runs as that person, the way a request would.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth_uid, 'role', 'authenticated')::text,
    true
  );

  ---------------------------------------------------------------------------
  -- 1. Three events, sealed by the trigger.
  ---------------------------------------------------------------------------
  v_first := public.record_campus_event(
    'IDENTITY_VERIFIED', 'VALID', v_student, v_location,
    null, null, '{"source":"test"}'::jsonb
  );
  v_second := public.record_campus_event(
    'LIBRARY_ENTRY', 'SUCCESS', v_student, v_location,
    null, null, '{}'::jsonb, now(), true
  );
  v_third := public.record_campus_event(
    'IDENTITY_REJECTED', 'REVOKED', v_student, v_location
  );

  if v_second.seq <> v_first.seq + 1 or v_third.seq <> v_second.seq + 1 then
    raise exception 'FAIL: chain positions are % % %', v_first.seq, v_second.seq, v_third.seq;
  end if;
  raise notice 'PASS: events take consecutive chain positions';

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

  v_status := public.campus_event_chain_status(v_uni);
  if v_status ->> 'status' <> 'UNBROKEN' then
    raise exception 'FAIL: chain status reported %', v_status;
  end if;
  raise notice 'PASS: the chain verifies as UNBROKEN across % events', v_status ->> 'events';

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
  -- 5. A student from another campus cannot be written about.
  ---------------------------------------------------------------------------
  if v_outsider is not null then
    v_failed := false;
    begin
      perform public.record_campus_event(
        'IDENTITY_VERIFIED', 'VALID', v_outsider, v_location
      );
    exception when others then
      v_failed := true;
    end;
    if not v_failed then
      raise exception 'FAIL: an event was recorded about another university''s student';
    end if;
    raise notice 'PASS: another campus cannot be written about';
  else
    raise notice 'SKIP: only one university present, tenant isolation not exercised';
  end if;

  ---------------------------------------------------------------------------
  -- 6. An unknown event type is refused.
  ---------------------------------------------------------------------------
  v_failed := false;
  begin
    perform public.record_campus_event('SOMETHING_ELSE', 'VALID', v_student, v_location);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL: an unknown event type was accepted';
  end if;
  raise notice 'PASS: the event vocabulary is enforced';

  ---------------------------------------------------------------------------
  -- 7. A guard cannot record library activity.
  ---------------------------------------------------------------------------
  update public.user_roles set role = 'guard', scope_type = 'location', scope_id = v_location
  where id = v_role_id;

  v_failed := false;
  begin
    perform public.record_campus_event('BOOK_ISSUED', 'SUCCESS', v_student, v_location);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL: a guard recorded a book issue';
  end if;
  raise notice 'PASS: a guard cannot record library activity';

  perform public.record_campus_event('IDENTITY_VERIFIED', 'VALID', v_student, v_location);
  raise notice 'PASS: a guard can still record identity verifications';

  raise notice '--- ALL CHECKS PASSED ---';
end;
$test$;

rollback;
