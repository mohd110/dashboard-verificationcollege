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
 * Leave it out to always create a separate demo record, which is what the two
 * new roles do: the real Neha Sharma already belongs to somebody else's login,
 * and taking it over would lock a teammate out of their own account.
 *
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
    role: 'guard',
    locationCode: 'GATE-1',
  },
  {
    email: 'neha@demo.gbpuat.test',
    displayName: 'Neha',
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

  const { data: byName } = member.matchDisplayName
    ? await admin
        .from('app_users')
        .select('id, auth_user_id')
        .eq('university_id', university.id)
        .eq('display_name', member.matchDisplayName)
        .maybeSingle()
    : { data: null };

  if (byName) {
    if (byName.auth_user_id && byName.auth_user_id !== authUserId) {
      // Somebody else signs in as this person. Taking the row over would lock
      // them out, so the demo account is refused instead.
      await admin.auth.admin.deleteUser(authUserId);
      return {
        id: null,
        created: false,
        problem: `"${member.matchDisplayName}" already belongs to another login`,
      };
    }

    const { error } = await admin
      .from('app_users')
      .update({ auth_user_id: authUserId, status: 'active' })
      .eq('id', byName.id);
    if (error) fail(`Could not link the login for ${member.email}`, error);

    return { id: byName.id, created: false };
  }

  // app_users.id has no default, and every row already there uses the auth
  // user id as its own, so a new record follows the same convention.
  const { data: inserted, error: insertError } = await admin
    .from('app_users')
    .insert({
      id: authUserId,
      university_id: university.id,
      display_name: member.displayName,
      status: 'active',
      auth_user_id: authUserId,
    })
    .select('id')
    .single();

  if (insertError) {
    // The login is useless without a staff record, so it does not stay behind.
    await admin.auth.admin.deleteUser(authUserId);
    return { id: null, created: false, problem: insertError.message };
  }

  return { id: inserted.id, created: true };
}

/**
 * Grants the role, or moves an existing grant to the right posting.
 *
 * Returns a message instead of exiting when the role is simply not in app_role
 * yet, which is the case for guard and librarian until migration 0100 has been
 * applied. One person being unseedable should not stop the others.
 */
async function upsertRole(member, appUserId) {
  const locationId = member.locationCode ? locationIdByCode.get(member.locationCode) : null;

  if (member.locationCode && !locationId) {
    return `location ${member.locationCode} does not exist`;
  }

  // scope_type has a CHECK constraint owned by the identity subsystem, so the
  // posting lives in its own column rather than bending that constraint.
  const scope = {
    scope_type: 'university',
    scope_id: university.id,
    location_id: locationId,
  };

  const { data: existing } = await admin
    .from('user_roles')
    .select('id')
    .eq('user_id', appUserId)
    .eq('role', member.role)
    .maybeSingle();

  if (existing) {
    const { error } = await admin.from('user_roles').update(scope).eq('id', existing.id);
    return error ? error.message : null;
  }

  const { error } = await admin
    .from('user_roles')
    .insert({ user_id: appUserId, role: member.role, ...scope });

  if (!error) return null;

  // 22P02 is an invalid enum label: the role has not been added to app_role.
  if (error.code === '22P02' || /invalid input value for enum/i.test(error.message)) {
    return `app_role has no "${member.role}" yet. Apply migration 0100 first.`;
  }
  if (/location_id/.test(error.message)) {
    return 'user_roles has no location_id yet. Apply migration 0102 first.';
  }
  return error.message;
}

console.log(`University: ${university.legal_name}\n`);

let blocked = 0;

for (const member of STAFF) {
  const authUserId = await upsertAuthUser(member.email);
  const record = await upsertStaffRecord(member, authUserId);

  if (record.problem) {
    blocked += 1;
    console.log(`${member.email.padEnd(26)} SKIPPED   ${record.problem}`);
    continue;
  }

  const problem = await upsertRole(member, record.id);

  if (problem) {
    blocked += 1;

    // Undo only what this run created. A login with no role cannot get past
    // the sign-in screen, so leaving one behind helps nobody.
    if (record.created) {
      await admin.from('app_users').delete().eq('id', record.id);
      await admin.auth.admin.deleteUser(authUserId);
      console.log(`${member.email.padEnd(26)} SKIPPED   ${problem}`);
    } else {
      console.log(`${member.email.padEnd(26)} NO ROLE   ${problem}`);
    }
    continue;
  }

  const posting = member.locationCode ? ` at ${member.locationCode}` : '';
  const how = record.created ? 'created' : 'linked to existing record';
  console.log(`${member.email.padEnd(26)} ${member.role}${posting}  (${how})`);
}

console.log(
  blocked === 0
    ? '\nDemo staff ready. All three sign in with DEMO_STAFF_PASSWORD.'
    : `\n${blocked} account(s) still blocked. The rest can sign in with DEMO_STAFF_PASSWORD.`,
);
