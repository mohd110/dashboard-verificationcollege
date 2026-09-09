import { cache } from 'react';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { AppRole, LocationType, RecordStatus } from '@/lib/types';

export type Posting = {
  id: string;
  code: string;
  name: string;
  type: LocationType;
};

export type StaffSession = {
  userId: string;
  email: string;
  fullName: string;
  status: RecordStatus;
  universityId: string;
  universityName: string;
  role: AppRole;
  /** The gate or library this person is posted to, if any. */
  posting: Posting | null;
};

const ADMIN_ROLES: AppRole[] = ['super_admin', 'university_admin'];

/**
 * The signed-in staff member, or null.
 *
 * Cached for the lifetime of one request so that a page and its layout do not
 * both pay for the same round trip.
 */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from('app_users')
    .select(
      `id, email, full_name, status, university_id,
       universities ( name ),
       user_roles ( role, campus_locations ( id, code, name, type ) )`,
    )
    .eq('id', user.id)
    .maybeSingle();

  if (!data) return null;

  const university = data.universities as unknown as { name: string } | null;
  const grants = (data.user_roles ?? []) as unknown as Array<{
    role: AppRole;
    campus_locations: Posting | null;
  }>;

  // A demo account holds one role. If that ever stops being true, the database
  // resolves the same way through current_user_role().
  const grant = grants[0];
  if (!grant) return null;

  return {
    userId: data.id,
    email: data.email,
    fullName: data.full_name,
    status: data.status,
    universityId: data.university_id,
    universityName: university?.name ?? 'University',
    role: grant.role,
    posting: grant.campus_locations ?? null,
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
 * Guards a page. Redirects rather than throwing, so a deactivated account or a
 * guard who typed an admin URL gets somewhere sensible instead of an error.
 */
export async function requireStaffSession(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect('/login');
  if (session.status !== 'active') redirect('/login?reason=deactivated');
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
