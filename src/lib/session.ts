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
 * with current_user_role() in migration 0102, so the interface and the
 * database never disagree about who somebody is.
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

/** Cached for the request, so a layout and its page share one round trip. */
const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

type SessionRow = {
  id: string;
  display_name: string;
  status: string;
  university_id: string;
  auth_user_id: string;
  universities: { legal_name: string; code: string } | null;
  user_roles: Array<{
    role: AppRole;
    location_id: string | null;
    campus_locations: { id: string; code: string; name: string; type: LocationType } | null;
  }>;
};

/**
 * The signed-in staff member.
 *
 * One query. The posting used to be a second round trip, which every page in
 * the application paid for on every navigation; nesting campus_locations under
 * the role grant gets it in the same request.
 *
 * Null covers two different situations, which matters: nobody is signed in, or
 * somebody is signed in whose login was never linked to an app_users row. The
 * guards below tell them apart.
 */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
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
  // problem when the real answer is a missing column or an unapplied
  // migration, so the database's own message is allowed through.
  if (error) {
    throw new Error(`Could not load your staff record: ${error.message}`);
  }

  if (!data) return null;

  const row = data as unknown as SessionRow;
  const grants = row.user_roles ?? [];
  if (grants.length === 0) return null;

  const role = [...grants].sort(
    (a, b) => ROLE_PRECEDENCE.indexOf(a.role) - ROLE_PRECEDENCE.indexOf(b.role),
  )[0].role;

  const posted = grants.find((grant) => grant.campus_locations);

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
    posting: posted?.campus_locations ?? null,
  };
});

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
    if (await getAuthUser()) redirect('/no-access');
    redirect('/login');
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
