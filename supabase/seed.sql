-- seed.sql
--
-- OWNER: Mammu.
--
-- Fabricated demo data only. No real student record belongs in here.
-- Safe to run more than once.
--
-- Staff accounts are not created here, because a Supabase login also needs a
-- row in auth.users. Run `npm run seed:staff` after this file to create Amit,
-- Neha and the administrator.

do $seed$
declare
  v_university uuid;
  v_cs         uuid;
  v_agri       uuid;
  v_vet        uuid;
begin
  insert into public.universities (code, name, short_name)
  values (
    'GBPUAT',
    'Govind Ballabh Pant University of Agriculture & Technology',
    'GBPUAT'
  )
  on conflict (code) do update set name = excluded.name
  returning id into v_university;

  insert into public.departments (university_id, code, name) values
    (v_university, 'CS',   'Computer Engineering'),
    (v_university, 'AGRI', 'Agronomy'),
    (v_university, 'VET',  'Veterinary Science'),
    (v_university, 'BIO',  'Basic Sciences and Humanities')
  on conflict (university_id, code) do nothing;

  select id into v_cs   from public.departments where university_id = v_university and code = 'CS';
  select id into v_agri from public.departments where university_id = v_university and code = 'AGRI';
  select id into v_vet  from public.departments where university_id = v_university and code = 'VET';

  -- The student the demo follows, plus enough classmates that the lists and
  -- filters have something to work on.
  insert into public.people (university_id, person_code, full_name, email, person_type, department_id) values
    (v_university, '20260042', 'Rahul Kumar',    'rahul.kumar@demo.gbpuat.test',    'student', v_cs),
    (v_university, '20260043', 'Priya Sharma',   'priya.sharma@demo.gbpuat.test',   'student', v_cs),
    (v_university, '20260044', 'Arjun Negi',     'arjun.negi@demo.gbpuat.test',     'student', v_cs),
    (v_university, '20260051', 'Sneha Bisht',    'sneha.bisht@demo.gbpuat.test',    'student', v_agri),
    (v_university, '20260052', 'Imran Qureshi',  'imran.qureshi@demo.gbpuat.test',  'student', v_agri),
    (v_university, '20260061', 'Kavita Rawat',   'kavita.rawat@demo.gbpuat.test',   'student', v_vet),
    (v_university, '20260062', 'Deepak Joshi',   'deepak.joshi@demo.gbpuat.test',   'student', v_vet),
    (v_university, '20260063', 'Anita Pandey',   'anita.pandey@demo.gbpuat.test',   'student', v_cs)
  on conflict (university_id, person_code) do nothing;

  insert into public.enrolments (university_id, person_id, department_id, programme, academic_year)
  select
    p.university_id,
    p.id,
    p.department_id,
    case d.code
      when 'CS'   then 'B.Tech Computer Engineering'
      when 'AGRI' then 'B.Sc. (Hons.) Agriculture'
      else 'B.V.Sc. & A.H.'
    end,
    '2026-27'
  from public.people p
  join public.departments d on d.id = p.department_id
  where p.university_id = v_university
  on conflict (person_id, programme, academic_year) do nothing;

  insert into public.campus_locations (university_id, code, name, type) values
    (v_university, 'GATE-1',      'Gate 1',          'gate'),
    (v_university, 'GATE-2',      'Gate 2',          'gate'),
    (v_university, 'LIB-CENTRAL', 'Central Library', 'library')
  on conflict (university_id, code) do nothing;
end
$seed$;
