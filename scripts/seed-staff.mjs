/**
 * Gives the demo staff a way to sign in: the administrator, Amit the guard and
 * Neha the librarian.
 *
 * This is a shared team database, so the script is deliberately careful. It
 * links logins onto app_users rows that already exist rather than creating
 * second copies of the same person, it only ever adds role grants, and it
 * touches nothing outside the three accounts listed below.
 *
 *   npm run seed:staff
 *
 * Re-running is safe.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_STAFF_PASSWORD;
const universityCode = process.env.DEMO_UNIVERSITY_CODE ?? 'northfield';

if (!url || !serviceRoleKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
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

/**
 * matchDisplayName attaches the login to a staff row that is already there.
 * locationCode is null for a role that is not posted anywhere.
 */
const STAFF = [
  {
    email: 'admin@demo.gbpuat.test',
    displayName: 'Northfield university admin',
    matchDisplayName: 'Northfield university admin',
    role: 'university_admin',
    locationCode: null,
  },
  {
    email: 'amit@demo.gbpuat.test',
    displayName: 'Amit',
    matchDisplayName: 'Amit',
    role: 'guard',
    locationCode: 'GATE-1',
  },
  {
    email: 'neha@demo.gbpuat.test',
    displayName: 'Neha Sharma',
    matchDisplayName: 'Neha Sharma',
    role: 'librarian',
    locationCode: 'CENTRAL-LIB',
  },
];

function fail(message, error) {
  console.error(`${message}: ${error?.message ?? error}`);
  process.exit(1);
}

const { data: university, error: universityError } = await admin
  .from('universities')
  .select('id, legal_name')
  .eq('code', universityCode)
  .single();

if (universityError) fail(`Could not find the university "${universityCode}"`, universityError);

const { data: locations, error: locationsError } = await admin
  .from('campus_locations')
  .select('id, code')
  .eq('university_id', university.id);

if (locationsError) fail('Could not read campus locations', locationsError);
const locationIdByCode = new Map(locations.map((row) => [row.code, row.id]));

/** Finds the login for an address, or creates it. Resets the password either way. */
async function upsertAuthUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error) return data.user.id;

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

/** Returns the app_users row for this person, creating one only if needed. */
async function upsertStaffRecord(member, authUserId) {
  const { data: byLogin } = await admin
    .from('app_users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (byLogin) return { id: byLogin.id, created: false };

  const { data: byName } = await admin
    .from('app_users')
    .select('id, auth_user_id')
    .eq('university_id', university.id)
    .eq('display_name', member.matchDisplayName)
    .maybeSingle();

  if (byName) {
    if (byName.auth_user_id && byName.auth_user_id !== authUserId) {
      fail(
        `"${member.matchDisplayName}" is already linked to a different login`,
        new Error('Refusing to move somebody else’s account.'),
      );
    }

    const { error } = await admin
      .from('app_users')
      .update({ auth_user_id: authUserId, status: 'active' })
      .eq('id', byName.id);
    if (error) fail(`Could not link the login for ${member.email}`, error);

    return { id: byName.id, created: false };
  }

  const { data: inserted, error: insertError } = await admin
    .from('app_users')
    .insert({
      university_id: university.id,
      display_name: member.displayName,
      status: 'active',
      auth_user_id: authUserId,
    })
    .select('id')
    .single();

  if (insertError) fail(`Could not create the staff record for ${member.email}`, insertError);
  return { id: inserted.id, created: true };
}

/** Grants the role, or moves an existing grant to the right posting. */
async function upsertRole(member, appUserId) {
  const locationId = member.locationCode ? locationIdByCode.get(member.locationCode) : null;

  if (member.locationCode && !locationId) {
    fail(`Location ${member.locationCode} is missing`, new Error('Check campus_locations.'));
  }

  const scope = locationId
    ? { scope_type: 'location', scope_id: locationId }
    : { scope_type: 'university', scope_id: university.id };

  const { data: existing } = await admin
    .from('user_roles')
    .select('id')
    .eq('user_id', appUserId)
    .eq('role', member.role)
    .maybeSingle();

  if (existing) {
    const { error } = await admin.from('user_roles').update(scope).eq('id', existing.id);
    if (error) fail(`Could not update the ${member.role} posting`, error);
    return;
  }

  const { error } = await admin
    .from('user_roles')
    .insert({ user_id: appUserId, role: member.role, ...scope });
  if (error) fail(`Could not grant ${member.role} to ${member.email}`, error);
}

console.log(`University: ${university.legal_name}\n`);

for (const member of STAFF) {
  const authUserId = await upsertAuthUser(member.email);
  const record = await upsertStaffRecord(member, authUserId);
  await upsertRole(member, record.id);

  const posting = member.locationCode ? ` at ${member.locationCode}` : '';
  const how = record.created ? 'created' : 'linked to existing record';
  console.log(`${member.email.padEnd(26)} ${member.role}${posting}  (${how})`);
}

console.log('\nDemo staff ready. All three sign in with DEMO_STAFF_PASSWORD.');
