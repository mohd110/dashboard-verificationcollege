'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { closeStudentSession, openStudentSession } from '@/lib/student/session';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCredential } from '@/lib/verification/verify';

/**
 * Signing a student in with their own card.
 *
 * Two factors, and they are the two halves the credential profile already
 * splits the student's identity into.
 *
 *   The card. A compact JWS the university signed. Checking that signature is
 *   a stronger proof than any password a student would choose, and it is the
 *   same check, through the same module, that the gate and the library desk
 *   make.
 *
 *   The date of birth. The profile deliberately keeps this OUT of the QR — it
 *   is one of the fields listed as never encoded — so a photographed card
 *   cannot supply it. It is never displayed anywhere in this application
 *   either. It is only ever compared.
 *
 * Why both: the pitch is blunt that a QR can be photographed. At a gate that
 * is survivable because a person is standing there comparing a face to a
 * photograph. Here nobody is, and a scan alone would hand a stranger somebody
 * else's movements around campus. So the thing that is hard to copy is paired
 * with the thing that is not written down.
 *
 * And for the same reason a typed student number is refused outright, even
 * though the gate accepts one. A number keyed in by hand proves only that the
 * number exists. A guard can make that judgement with a face in front of them;
 * an unattended screen cannot.
 */

const request = z.object({
  payload: z.string().trim().min(1, 'Scan the QR code on your card.').max(4096),
  dateOfBirth: z.string().trim().min(1, 'Enter your date of birth.'),
});

export type StudentSignInState = { error: string | null };

/** A scan looks like a compact JWS; anything else was typed. */
function looksLikeCard(payload: string): boolean {
  return payload.trim().split('.').length === 3;
}

export async function signInWithCard(
  _state: StudentSignInState,
  formData: FormData,
): Promise<StudentSignInState> {
  const parsed = request.safeParse({
    payload: formData.get('payload'),
    dateOfBirth: formData.get('dateOfBirth'),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { payload, dateOfBirth } = parsed.data;

  if (!looksLikeCard(payload)) {
    return {
      error:
        'That is not a scanned card. A typed student number is accepted at the gate, where a guard can see you, but not here.',
    };
  }

  // Anonymous: there is no session yet, and producing one is the point of
  // this call. See the option's note in lib/verification/verify.
  const result = await verifyCredential(payload, undefined, { anonymous: true });

  if (!result.verified) {
    // The verifier's reasons are written for staff and some carry the crypto
    // library's own wording. A student needs to know what to do next, so the
    // common states get a plain sentence and anything else falls through.
    const plain: Record<string, string> = {
      INVALID_SIGNATURE:
        'This card did not pass the university signature check. If it is your card, take it to the registry office.',
      MALFORMED: 'That is not a university card. Scan the QR code printed on your ID card.',
      EXPIRED: 'Your card has expired. The registry office can re-issue it.',
      REVOKED: 'This card has been blocked by the university. Speak to the registry office.',
      SUSPENDED: 'This card is suspended pending review. Speak to the registry office.',
      WRONG_ISSUER: 'This card was issued by a different institution.',
    };
    return { error: plain[result.state ?? ''] ?? result.reason };
  }

  if (!result.personId) {
    // The signature checked out but the register has nobody behind it. That is
    // our problem, not the student's, so it must not be reported using the
    // verifier's success message.
    return {
      error: 'That card is genuine, but no student record on this campus matches it.',
    };
  }

  const supabase = await createServiceClient();
  const { data: person } = await supabase
    .from('people')
    .select('id, full_name, student_id, date_of_birth, status, role')
    .eq('id', result.personId)
    .maybeSingle();

  if (!person) {
    return { error: 'That card verified, but no student record on this campus matches it.' };
  }

  if (person.role !== 'student') {
    return { error: 'The student pass is for students. Staff sign in on the main screen.' };
  }

  if (person.status !== 'active') {
    return { error: 'This student record is no longer active. Speak to the registry office.' };
  }

  if (!person.date_of_birth) {
    return {
      error:
        'There is no date of birth on your record, so the pass cannot check it. The registry office can add one.',
    };
  }

  // Compared as the calendar date the register holds, so a time zone cannot
  // turn a correct answer into a wrong one.
  if (String(person.date_of_birth).slice(0, 10) !== dateOfBirth.slice(0, 10)) {
    // Deliberately does not say which of the two was wrong. Saying "the card
    // is fine, the date is not" tells whoever holds a photographed QR exactly
    // what is left to guess.
    return { error: 'That card and date of birth do not match.' };
  }

  await openStudentSession({
    personId: person.id,
    credentialId: result.credentialId,
    studentNumber: person.student_id ?? null,
    fullName: person.full_name ?? null,
  });

  redirect('/me');
}

export async function signOutStudent(): Promise<void> {
  await closeStudentSession();
  redirect('/me/sign-in');
}
