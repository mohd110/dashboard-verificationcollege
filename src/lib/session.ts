import { cache } from 'react';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { AppRole, LocationType } from '@/lib/types';

export type Posting = {
  id: string;
  code: string;
  name: string;
  type: LocationType;
};

export type StaffSession = {
  /** app_users.id, which is what campus_events.actor_id points at. */
  userId: string;
  /** auth.users.id, which is what the session cookie carries. */
  authUserId: string;
  email: string;
  fullName: string;
  status: string;
  universityId: string;
  universityName: string;
  /** Short tenant code. The first four characters are printed on every card. */
  universityCode: string;
  role: AppRole;
  /** The gate or library this person is posted to, if any. */
  posting: Posting | null;
};

const ADMIN_ROLES: AppRole[] = ['platform_admin', 'university_admin'];

/**
 * Order of precedence when an account holds more than one role. Kept in step
 * with current_user_role() in migration 0102 and current_staff_session() in
 * 0108, so the interface and the database never disagree about who somebody is.
 */
const ROLE_PRECEDENCE: AppRole[] = [
  'platform_admin',
  'university_admin',
  'registrar',
  'department_admin',
  'card_operator',
  'revocation_officer',
  'librarian',
  'guard',
  'verifier',
  'auditor',
];

type SessionRow = {
  user_id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  status: string;
  university_id: string;
  university_name: string;
  university_code: string;
  role: AppRole | null;
  location_id: string | null;
  location_code: string | null;
  location_name: string | null;
  location_type: LocationType | null;
};

function toSession(row: SessionRow): StaffSession | null {
  // No role means an account that exists but has been granted nothing. That is
  // "no access", not a session.
  if (!row.role) return null;

  return {
    userId: row.user_id,
    authUserId: row.auth_user_id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    universityId: row.university_id,
    universityName: row.university_name,
    universityCode: row.university_code,
    role: row.role,
    posting:
      row.location_id && row.location_code && row.location_name && row.location_type
        ? {
            id: row.location_id,
            code: row.location_code,
            name: row.location_name,
            type: row.location_type,
          }
        : null,
  };
}

/**
 * The whole session in one round trip.
 *
 * A call to Supabase costs about 300 ms from this project, and a one-row query
 * costs almost exactly what a 150-row one does. So what makes a page slow is
 * the number of calls, not the size of the data. This used to be three:
 * auth.getUser(), a query against app_users, and a query for the posting.
 *
 * The database resolves the caller from auth.uid(), whose signature PostgREST
 * has already verified, so a separate getUser() establishes nothing that this
 * call does not. Cached for the request, so a layout and its page share it.
 */
/**
 * Set once if the database has not had migration 0108 applied, so a deployment
 * running against an older database pays for the missing function once rather
 * than on every request.
 */
let sessionFunctionMissing = false;

export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  if (sessionFunctionMissing) return legacySession('current_staff_session is not installed');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('current_staff_session');

  if (!error) {
    const rows = (data ?? []) as SessionRow[];
    return rows[0] ? toSession(rows[0]) : null;
  }

  // PGRST202 is "no function matches". Anything else is a real failure and
  // must not be papered over, so only that one turns the fallback on.
  if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message)) {
    sessionFunctionMissing = true;
  }

  return legacySession(error.message);
});

/**
 * The path taken before migration 0108 is applied.
 *
 * Three round trips instead of one, kept only so a deployment whose database
 * is a migration behind still signs people in rather than locking everyone out.
 * It can be deleted once 0108 is applied everywhere.
 */
async function legacySession(reason: string): Promise<StaffSession | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('app_users')
    .select(
      `id, display_name, status, university_id, auth_user_id,
       universities ( legal_name, code ),
       user_roles ( role, location_id, campus_locations ( id, code, name, type ) )`,
    )
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // A failed query is not the same as an account with no access. Swallowing
  // one and calling it "no access" sends people hunting for a permissions
  // problem when the real answer is a missing column or an unapplied migration,
  // so the database's own message is allowed through.
  if (error) {
    throw new Error(`Could not load your staff record: ${error.message} (after: ${reason})`);
  }

  if (!data) return null;

  const row = data as unknown as {
    id: string;
    display_name: string;
    status: string;
    university_id: string;
    auth_user_id: string;
    universities: { legal_name: string; code: string } | null;
    user_roles: Array<{
      role: AppRole;
      location_id: string | null;
      campus_locations: Posting | null;
    }>;
  };

  const grants = row.user_roles ?? [];
  if (grants.length === 0) return null;

  const role = [...grants].sort(
    (a, b) => ROLE_PRECEDENCE.indexOf(a.role) - ROLE_PRECEDENCE.indexOf(b.role),
  )[0].role;

  return {
    userId: row.id,
    authUserId: row.auth_user_id,
    email: user.email ?? '',
    fullName: row.display_name,
    status: row.status,
    universityId: row.university_id,
    universityName: row.universities?.legal_name ?? 'University',
    universityCode: row.universities?.code ?? '',
    role,
    posting: grants.find((grant) => grant.campus_locations)?.campus_locations ?? null,
  };
}

export function isAdmin(session: StaffSession): boolean {
  return ADMIN_ROLES.includes(session.role);
}

/** Where a role lands after signing in. */
export function homePathFor(session: StaffSession): string {
  return isAdmin(session) ? '/admin' : '/console';
}

/**
 * Guards a page.
 *
 * Somebody with a login but no staff record goes to /no-access rather than to
 * /login: the middleware sends a signed-in visitor away from /login, so the
 * two would otherwise bounce off each other for ever.
 */
export async function requireStaffSession(): Promise<StaffSession> {
  const session = await getStaffSession();

  if (!session) {
    // Only now is it worth a round trip to tell "signed out" from "signed in
    // with no staff record". Both are rare, and neither is on the fast path.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    redirect(user ? '/no-access' : '/login');
  }

  if (session.status !== 'active') redirect('/no-access?reason=deactivated');
  return session;
}

export async function requireAdminSession(): Promise<StaffSession> {
  const session = await requireStaffSession();
  if (!isAdmin(session)) redirect('/console');
  return session;
}

/**
 * Admin guard for server actions.
 *
 * Throws rather than redirecting, because an action has no page to send anyone
 * to. Row level security blocks the same writes independently; this only turns
 * a database error into a sentence a person can read.
 */
export async function assertAdminForAction(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session || session.status !== 'active' || !isAdmin(session)) {
    throw new Error('You do not have permission to do that.');
  }
  return session;
}
