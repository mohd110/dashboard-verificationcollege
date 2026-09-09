-- preflight.sql
--
-- Run this FIRST, before any migration. It changes nothing at all: no writes,
-- no DDL, not even a transaction to roll back. It reports whether migrations
-- 0100 to 0104 would collide with anything already in this database.
--
-- Read every line of the output. Anything that says CONFLICT has to be settled
-- with whoever owns it before the migrations run.

do $preflight$
declare
  v_name  text;
  v_count int;
  v_ok    boolean := true;
  v_row   record;
begin
  raise notice '--- extensions ---';

  select extnamespace::regnamespace::text into v_name
  from pg_extension where extname = 'pgcrypto';

  if v_name is null then
    raise notice 'pgcrypto is NOT installed. Migration 0101 installs it. If this';
    raise notice '   database forbids creating extensions, install it by hand first.';
  else
    raise notice 'OK  pgcrypto is installed in schema %', v_name;
    if v_name not in ('public', 'extensions') then
      v_ok := false;
      raise notice 'CONFLICT  the hash function searches public and extensions only.';
    end if;
  end if;

  raise notice '';
  raise notice '--- function names 0100-0104 would create ---';

  for v_row in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args,
           pg_get_function_result(p.oid) as result
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'campus_event_hash', 'campus_events_seal', 'campus_events_block_mutation',
        'role_may_record_event', 'record_campus_event', 'campus_event_types',
        'campus_event_results', 'current_app_user_id', 'current_university_id',
        'current_user_role', 'current_user_is_admin', 'current_user_location_id',
        'verify_campus_event_chain', 'campus_event_chain_status', 'verify_campus_event'
      )
  loop
    v_ok := false;
    raise notice 'CONFLICT  %(%) already exists returning %',
      v_row.proname, v_row.args, v_row.result;
    raise notice '          CREATE OR REPLACE fails if the return type differs.';
  end loop;

  if v_ok then
    raise notice 'OK  none of those names are taken';
  end if;

  raise notice '';
  raise notice '--- campus_events ---';

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campus_events' and column_name = 'seq'
  ) then
    raise notice 'CONFLICT  a seq column already exists. 0101 expects to add it.';
    v_ok := false;
  else
    raise notice 'OK  no seq column yet, 0101 will add one';
  end if;

  select count(*) into v_count from public.campus_events;
  raise notice 'INFO  % existing rows, which 0101 will back-fill and hash', v_count;

  for v_row in
    select t.tgname, p.proname
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.campus_events'::regclass and not t.tgisinternal
  loop
    if v_row.tgname in ('campus_events_seal', 'campus_events_no_mutation') then
      raise notice 'INFO  trigger % already exists and will be replaced', v_row.tgname;
    else
      raise notice 'CONFLICT  unexpected trigger % calling %', v_row.tgname, v_row.proname;
      raise notice '          Check it does not also write prev_hash or event_hash.';
      v_ok := false;
    end if;
  end loop;

  raise notice '';
  raise notice '--- app_role ---';

  for v_name in
    select unnest(array['guard', 'librarian'])
  loop
    if exists (
      select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'app_role' and e.enumlabel = v_name
    ) then
      raise notice 'INFO  app_role already has %, 0100 is a no-op for it', v_name;
    else
      raise notice 'OK  app_role does not have % yet', v_name;
    end if;
  end loop;

  raise notice '';
  if v_ok then
    raise notice '--- PREFLIGHT CLEAR, MIGRATIONS 0100-0104 ARE SAFE TO RUN ---';
  else
    raise notice '--- PREFLIGHT FOUND CONFLICTS, DO NOT RUN THE MIGRATIONS YET ---';
  end if;
end;
$preflight$;
