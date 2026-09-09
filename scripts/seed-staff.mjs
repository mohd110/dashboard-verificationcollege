/**
 * Creates the demo staff logins: the administrator, Amit the guard and Neha
 * the librarian.
 *
 * A Supabase login needs a row in auth.users, which plain SQL cannot create
 * safely, so this runs against the admin API instead of living in seed.sql.
 * Run it after supabase/seed.sql, which creates the university and the
 * locations these accounts are posted to.
 *
 *   npm run seed:staff
 *
 * Re-running is safe: existing accounts are updated rather than duplicated.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_STAFF_PASSWORD;

if (!url || !serviceRoleKey) {
  console.error(
    'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.',
  );
  process.exit(1);
}

if (!password || password.length < 12) {
  console.error(
    'Set DEMO_STAFF_PASSWORD in .env.local to at least 12 characters.\n' +
      'These are real logins, so there is no default password.',
  );
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Demo staff. locationCode is null for roles that are not posted anywhere. */
const STAFF = [
  {
    email: 'admin@demo.gbpuat.test',
    fullName: 'University Admin',
    role: 'university_admin',
    locationCode: null,
  },
  {
    email: 'amit@demo.gbpuat.test',
    fullName: 'Amit',
    role: 'guard',
    locationCode: 'GATE-1',
  },
  {
    email: 'neha@demo.gbpuat.test',
    fullName: 'Neha',
    role: 'librarian',
    locationCode: 'LIB-CENTRAL',
  },
];

function fail(message, error) {
  console.error(`${message}: ${error.message ?? error}`);
  process.exit(1);
}

const { data: university, error: universityError } = await admin
  .from('universities')
  .select('id')
  .eq('code', 'GBPUAT')
  .single();

if (universityError) {
  fail('Could not read the university. Run supabase/seed.sql first', universityError);
}

const { data: locations, error: locationsError } = await admin
  .from('campus_locations')
  .select('id, code')
  .eq('university_id', university.id);

if (locationsError) fail('Could not read campus locations', locationsError);

const locationIdByCode = new Map(locations.map((row) => [row.code, row.id]));

/** Finds an existing auth user by email, or creates one. */
async function upsertAuthUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error) return data.user.id;

  // createUser has no upsert mode, so an existing address comes back as a
  // conflict and the account has to be looked up and its password reset.
  const alreadyExists =
    error.status === 422 || /already been registered|already exists/i.test(error.message);
  if (!alreadyExists) fail(`Could not create the login for ${email}`, error);

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) fail('Could not list existing logins', listError);

  const existing = list.users.find((user) => user.email === email);
  if (!existing) fail(`${email} is registered but could not be found`, error);

  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (updateError) fail(`Could not reset the password for ${email}`, updateError);

  return existing.id;
}

for (const member of STAFF) {
  const userId = await upsertAuthUser(member.email);

  const { error: profileError } = await admin.from('app_users').upsert(
    {
      id: userId,
      university_id: university.id,
      full_name: member.fullName,
      email: member.email,
      status: 'active',
    },
    { onConflict: 'id' },
  );
  if (profileError) fail(`Could not save the profile for ${member.email}`, profileError);

  const locationId = member.locationCode ? locationIdByCode.get(member.locationCode) : null;
  if (member.locationCode && !locationId) {
    fail(
      `Location ${member.locationCode} is missing`,
      new Error('Run supabase/seed.sql before this script.'),
    );
  }

  const { error: roleError } = await admin.from('user_roles').upsert(
    {
      user_id: userId,
      university_id: university.id,
      role: member.role,
      location_id: locationId,
    },
    { onConflict: 'user_id,role' },
  );
  if (roleError) fail(`Could not grant ${member.role} to ${member.email}`, roleError);

  const posting = member.locationCode ? ` at ${member.locationCode}` : '';
  console.log(`${member.email.padEnd(28)} ${member.role}${posting}`);
}

console.log('\nDemo staff ready. All three sign in with DEMO_STAFF_PASSWORD.');
