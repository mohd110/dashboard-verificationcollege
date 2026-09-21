import 'server-only';

import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

/**
 * The student pass session.
 *
 * Students are not staff. They have no auth.users login, no app_users row and
 * no role, and giving them one would put a hundred and fifty people into the
 * table the staff screens read. They also should not need a password: the
 * university already issued them a credential it signed itself, and checking
 * that signature is a stronger proof of identity than any password they would
 * pick.
 *
 * So a student proves who they are by presenting their card, and this module
 * holds the short-lived cookie that follows. It carries a person id and
 * nothing else worth stealing; every screen re-reads the register.
 *
 * Deliberately short. A pass is opened on a phone at a gate or a library desk,
 * often a borrowed one, and there is no sign-out habit to rely on.
 */

const COOKIE = 'gbpuat-student-pass';
const TTL_MINUTES = 30;

export type StudentSession = {
  /** people.id */
  personId: string;
  /** The credential that was presented. */
  credentialId: string | null;
  studentNumber: string | null;
  fullName: string | null;
  /** Seconds since the epoch. */
  expiresAt: number;
};

/**
 * The key this cookie is signed with.
 *
 * STUDENT_SESSION_SECRET when it is set. Otherwise one derived from the
 * service role key, which is already a server-only secret of the right
 * strength and is guaranteed to be present — the alternative is a deployment
 * that builds and then cannot sign anybody in. The salt keeps the derived key
 * from being usable anywhere the service role key itself is expected.
 */
function signingKey(): Uint8Array {
  const configured = process.env.STUDENT_SESSION_SECRET;
  if (configured && configured.length >= 32) {
    return new TextEncoder().encode(configured);
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'Set STUDENT_SESSION_SECRET (32 characters or more) so student passes can be signed.',
    );
  }

  return new Uint8Array(
    createHash('sha256').update(`gbpuat-student-pass:${serviceRoleKey}`).digest(),
  );
}

export async function openStudentSession(
  session: Omit<StudentSession, 'expiresAt'>,
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_MINUTES * 60;

  const token = await new SignJWT({
    personId: session.personId,
    credentialId: session.credentialId,
    studentNumber: session.studentNumber,
    fullName: session.fullName,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(signingKey());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/me',
    maxAge: TTL_MINUTES * 60,
  });
}

export async function readStudentSession(): Promise<StudentSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, signingKey());

    return {
      personId: String(payload.personId),
      credentialId: (payload.credentialId as string | null) ?? null,
      studentNumber: (payload.studentNumber as string | null) ?? null,
      fullName: (payload.fullName as string | null) ?? null,
      expiresAt: Number(payload.exp ?? 0),
    };
  } catch {
    // Expired or tampered with. Both mean no session, and neither is worth
    // distinguishing for somebody who simply has to scan their card again.
    return null;
  }
}

export async function closeStudentSession(): Promise<void> {
  const store = await cookies();
  store.delete({ name: COOKIE, path: '/me' });
}

/** Minutes left on the pass, for the countdown the screens show. */
export function minutesLeft(session: StudentSession): number {
  return Math.max(0, Math.ceil((session.expiresAt - Date.now() / 1000) / 60));
}
