import 'server-only';

import { getStaffSession } from '@/lib/session';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Who is acting at the issue desk.
 *
 * The library application arrived with its own copy of this, which resolved a
 * librarian by looking for a people row whose email matched the login and
 * whose role column said 'librarian'. This project already answers the same
 * question through getStaffSession(), from user_roles, and that is the answer
 * the admin dashboard, the gate console and row level security all use.
 *
 * Two different notions of "is this person a librarian" in one application is
 * a bug waiting to happen, so this is now a thin adapter over the platform
 * session. The shape it returns is unchanged, which is why every library
 * action ported across without edits.
 */

export class LibrarianAuthError extends Error {
  status: 'UNAUTHORIZED' | 'FORBIDDEN';

  constructor(status: 'UNAUTHORIZED' | 'FORBIDDEN', message: string) {
    super(message);
    this.status = status;
    this.name = 'LibrarianAuthError';
  }
}

export interface LibrarianContext {
  authUserId: string;
  appUserId: string;
  /**
   * The librarian as a person (people.id), which is what
   * book_transactions.actor_id points at. campus_events.actor_id points at
   * app_users.id instead — see migration 003_actor_id_meaning.
   */
  personId: string | null;
  universityId: string;
  /**
   * The university's short code. Its first four characters are the `iss`
   * claim on every card this campus signs, so a scan can refuse a genuine
   * card from a different institution.
   */
  universityCode: string;
  /** The library this desk stands in, when the campus has one. */
  locationId: string | null;
  locationName: string;
  name: string;
  email: string;
}

/** Roles allowed to work the issue desk. */
const DESK_ROLES = ['librarian', 'university_admin', 'platform_admin'] as const;

/**
 * Resolves the signed-in staff member to a librarian's working context.
 *
 * Fails closed: no session, an inactive account or a role with no business at
 * the issue desk all raise rather than falling back to a default university.
 */
export async function getLibrarianContext(): Promise<LibrarianContext> {
  const session = await getStaffSession();

  if (!session) throw new LibrarianAuthError('UNAUTHORIZED', 'Not signed in.');
  if (session.status !== 'active') {
    throw new LibrarianAuthError('FORBIDDEN', 'This account has been deactivated.');
  }
  if (!DESK_ROLES.includes(session.role as (typeof DESK_ROLES)[number])) {
    throw new LibrarianAuthError('FORBIDDEN', 'This account does not have library staff access.');
  }

  const supabase = await createServiceClient();

  // A librarian posted to the library desk uses that posting. An administrator
  // looking at the library screens has no posting, so the campus library is
  // used instead: the events still have to say where they happened.
  let locationId = session.posting?.type === 'library' ? session.posting.id : null;
  let locationName = locationId ? session.posting!.name : 'Central Library';

  if (!locationId) {
    const { data: library } = await supabase
      .from('campus_locations')
      .select('id, name')
      .eq('university_id', session.universityId)
      .eq('type', 'library')
      .limit(1)
      .maybeSingle();

    locationId = library?.id ?? null;
    locationName = library?.name ?? 'Central Library';
  }

  // book_transactions.actor_id is a people.id, and a staff login does not
  // carry one. Matching on email is how migration 003 says to cross between
  // the two identifiers. A desk with no matching person row still works; the
  // transaction simply records no actor.
  const { data: person } = await supabase
    .from('people')
    .select('id')
    .eq('university_id', session.universityId)
    .eq('email', session.email)
    .maybeSingle();

  return {
    authUserId: session.authUserId,
    appUserId: session.userId,
    personId: person?.id ?? null,
    universityId: session.universityId,
    universityCode: session.universityCode,
    locationId,
    locationName,
    name: session.fullName,
    email: session.email,
  };
}

/**
 * The `iss` claim this desk will accept, or undefined to accept any card
 * signed by a key this university publishes.
 *
 * The claim is capped at four characters by the credential profile, so the
 * code is truncated the same way the issuer truncates it.
 */
export function expectedIssuer(context: LibrarianContext): string | undefined {
  return context.universityCode.slice(0, 4) || undefined;
}
