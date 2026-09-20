import 'server-only';

import { redirect } from 'next/navigation';

import { getStaffSession, homePathFor, type StaffSession } from '@/lib/session';
import type { AppRole } from '@/lib/types';

/**
 * What each records office role may do.
 *
 * These are not invented for the interface. They are a mirror of the row level
 * security already in the database — people_select and people_write in
 * migration 20260830000200, credentials_insert and credential_status_update in
 * 20260831000300 — so a button is shown exactly when the database would allow
 * the write behind it. If the two ever disagree the database wins, which is
 * the right way round: hiding a button is a courtesy, the policy is the rule.
 *
 * Worth knowing when reading the screens: the split is genuinely uneven. A
 * registrar may read the student register but not the credentials on it. A
 * revocation officer is the other way about — they may block a card without
 * being able to open the student's record. Neither is an oversight; blocking a
 * lost card does not require knowing whose it is.
 */
export type Capability =
  | 'students.read'
  | 'students.write'
  | 'credentials.read'
  | 'credentials.issue'
  | 'credentials.revoke'
  | 'activity.read';

const CAPABILITIES: Record<AppRole, Capability[]> = {
  platform_admin: [
    'students.read',
    'students.write',
    'credentials.read',
    'credentials.issue',
    'credentials.revoke',
    'activity.read',
  ],
  university_admin: [
    'students.read',
    'students.write',
    'credentials.read',
    'credentials.issue',
    'credentials.revoke',
    'activity.read',
  ],
  registrar: ['students.read', 'students.write', 'activity.read'],
  card_operator: ['students.read', 'credentials.read', 'credentials.issue', 'activity.read'],
  revocation_officer: ['credentials.read', 'credentials.revoke', 'activity.read'],
  auditor: ['students.read', 'credentials.read', 'activity.read'],
  department_admin: ['students.read', 'activity.read'],
  librarian: [],
  guard: [],
  verifier: [],
};

/** Everything this role may do, for the sidebar to filter itself with. */
export function capabilitiesFor(session: StaffSession): readonly Capability[] {
  return CAPABILITIES[session.role];
}

export function can(session: StaffSession, capability: Capability): boolean {
  return CAPABILITIES[session.role].includes(capability);
}

/** Roles with any business in the records office at all. */
export function worksInRecords(session: StaffSession): boolean {
  return CAPABILITIES[session.role].length > 0;
}

/**
 * Guards a records office page.
 *
 * Somebody who may not be here is sent to their own home rather than shown an
 * error, because there is nothing for them to do about it.
 */
export async function requireRecordsSession(capability?: Capability): Promise<StaffSession> {
  const session = await getStaffSession();

  if (!session) redirect('/login?next=/records');
  if (session.status !== 'active') redirect('/no-access?reason=deactivated');
  if (!worksInRecords(session)) redirect(homePathFor(session));
  if (capability && !can(session, capability)) redirect(recordsHomeFor(session));

  return session;
}

/** The first records screen this role can actually use. */
export function recordsHomeFor(session: StaffSession): string {
  if (can(session, 'students.read')) return '/records';
  if (can(session, 'credentials.read')) return '/records/cards';
  return '/records/activity';
}

/**
 * The same check for a server action.
 *
 * Throws rather than redirecting, because an action has no page to send
 * anybody to. Row level security refuses the same write independently; this
 * only turns a database error into a sentence somebody can read.
 */
export async function assertRecordsCapability(capability: Capability): Promise<StaffSession> {
  const session = await getStaffSession();

  if (!session || session.status !== 'active' || !can(session, capability)) {
    throw new Error('You do not have permission to do that.');
  }

  return session;
}
