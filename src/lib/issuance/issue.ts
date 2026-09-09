import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { buildCredential, endOfAcademicYear } from '@/lib/credential/builder';
import { checkBudget, serialiseClaims } from '@/lib/credential/codec';
import type { CompactCredential } from '@/lib/credential/profile';
import type { EnvKeySigner } from '@/lib/crypto/env-signer';
import { planQr } from '@/lib/qr/payload';

/**
 * Issuance: turning a student record into a signed credential.
 *
 * This file is a port of the issuer in Saif's verification dashboard and is
 * kept deliberately identical to it, field for field and step for step. Both
 * applications write to the same credentials table, and a card issued here has
 * to be indistinguishable from one issued there — same claim order, same
 * expiry rule, same hash. Any change to this file has to be made in both.
 *
 * The order of operations matters. The credential is signed BEFORE it is
 * stored, and what gets stored is the exact bytes that were signed, not a
 * re-derivation of them. During an investigation the database has to be
 * comparable with a card byte for byte.
 */

export type IssueRequest = {
  personId: string;
  universityId: string;
  /** Short issuer code printed into the credential. Four characters at most. */
  issuerCode: string;
  /** app_users.id of whoever pressed the button. */
  actorId: string;
  monthsValid?: number;
};

export type IssueResult = {
  credentialId: string;
  jti: string;
  compactJws: string;
  claims: CompactCredential;
  credentialHash: string;
  qr: ReturnType<typeof planQr>;
  cardId: string;
  sequenceNo: number;
};

export type IssuanceFailureCode =
  | 'no_such_person'
  | 'no_enrolment'
  | 'no_active_key'
  | 'over_budget'
  | 'storage_failed';

export class IssuanceFailure extends Error {
  constructor(
    message: string,
    readonly code: IssuanceFailureCode,
  ) {
    super(message);
    this.name = 'IssuanceFailure';
  }
}

/**
 * A deterministic stand-in for a photograph hash.
 *
 * The demo has no real photographs, but the photo binding has to be real: `ph`
 * must be a stable hash of whatever image the verifier will display, or a
 * swapped picture would go unnoticed. Hashing the storage key gives a stable
 * per-person value now, and swapping in the actual image bytes later changes
 * only this function.
 */
export function photoHash(photoObjectKey: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(photoObjectKey).digest().subarray(0, 16));
}

type PersonRow = {
  id: string;
  university_id: string;
  given_name: string | null;
  family_name: string | null;
  full_name: string | null;
  photo_object_key: string | null;
};

type EnrolmentRow = {
  student_number: string;
  department_id: string;
  departments: { code: string } | null;
};

/**
 * Splits a display name when the two-part columns are empty.
 *
 * The register has both `full_name` and `given_name`/`family_name`, and rows
 * created by different applications fill different ones. The card needs a
 * given and a family name, so whichever is present has to answer.
 */
function nameParts(person: PersonRow): { given: string; family: string } {
  const given = person.given_name?.trim();
  const family = person.family_name?.trim();
  if (given && family) return { given, family };

  const whole = (person.full_name ?? '').trim().split(/\s+/).filter(Boolean);
  if (whole.length === 0) return { given: given ?? 'Student', family: family ?? 'Unnamed' };
  if (whole.length === 1) return { given: whole[0], family: family ?? whole[0] };

  return { given: given ?? whole[0], family: family ?? whole.slice(1).join(' ') };
}

export async function issueCredential(
  db: SupabaseClient,
  signer: EnvKeySigner,
  request: IssueRequest,
): Promise<IssueResult> {
  // 1. The student, and the enrolment that makes them a student.
  const { data: person } = await db
    .from('people')
    .select('id, university_id, given_name, family_name, full_name, photo_object_key')
    .eq('id', request.personId)
    .eq('university_id', request.universityId)
    .maybeSingle<PersonRow>();

  if (!person) {
    throw new IssuanceFailure('No such person on this campus.', 'no_such_person');
  }

  const { data: enrolment } = await db
    .from('enrolments')
    .select('student_number, department_id, departments(code)')
    .eq('person_id', person.id)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle<EnrolmentRow>();

  if (!enrolment) {
    throw new IssuanceFailure('This person has no active enrolment.', 'no_enrolment');
  }

  // 2. The signing key on record, so the credential can say which key signed it.
  const { data: key } = await db
    .from('issuer_keys')
    .select('id, kid, alg')
    .eq('university_id', request.universityId)
    .eq('status', 'active')
    .eq('kid', signer.kid)
    .limit(1)
    .maybeSingle<{ id: string; kid: string; alg: string }>();

  if (!key) {
    throw new IssuanceFailure(
      `No active signing key is registered under kid "${signer.kid}". Run: npm run key:generate`,
      'no_active_key',
    );
  }

  // 3. A card to attach it to. Reissues increment the sequence number so a
  //    resurfaced older card is visibly stale at the gate.
  const { data: previous } = await db
    .from('cards')
    .select('sequence_no')
    .eq('person_id', person.id)
    .order('sequence_no', { ascending: false })
    .limit(1)
    .maybeSingle<{ sequence_no: number }>();

  const sequenceNo = (previous?.sequence_no ?? 0) + 1;

  const { data: card, error: cardError } = await db
    .from('cards')
    .insert({
      university_id: request.universityId,
      person_id: person.id,
      sequence_no: sequenceNo,
      status: 'issued',
      printed_at: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    })
    .select('id')
    .single<{ id: string }>();

  if (cardError || !card) {
    throw new IssuanceFailure(
      `The card could not be created: ${cardError?.message}`,
      'storage_failed',
    );
  }

  // 4. Where this credential sits in the revocation list. Allocated per
  //    university.
  const { count } = await db
    .from('credentials')
    .select('id', { count: 'exact', head: true })
    .eq('university_id', request.universityId);

  const statusListIndex = count ?? 0;

  // 5. Build the claims. 128 bits of randomness for the id, so credential ids
  //    cannot be walked through the status endpoint.
  const issuedAt = new Date();
  const { given, family } = nameParts(person);

  const claims = buildCredential(
    {
      studentNumber: enrolment.student_number,
      givenName: given,
      familyName: family,
      departmentCode: enrolment.departments?.code ?? 'GEN',
      role: 's',
      cardSequence: sequenceNo,
    },
    {
      issuerCode: request.issuerCode,
      credentialId: new Uint8Array(randomBytes(16)),
      photoHash: photoHash(person.photo_object_key ?? person.id),
      statusListIndex,
      issuedAt,
      expiresAt: endOfAcademicYear(issuedAt, request.monthsValid ?? 12),
    },
  );

  // 6. Refuse to print something a phone cannot read, before signing it.
  const budget = checkBudget(claims, signer.alg, signer.kid);
  if (!budget.withinBudget) {
    throw new IssuanceFailure(
      `The credential would be ${budget.length} characters, ${-budget.headroom} over the limit.`,
      'over_budget',
    );
  }

  // 7. Sign. Everything above this line is data; this is the moment it becomes
  //    a credential.
  const payload = new TextEncoder().encode(serialiseClaims(claims));
  const compactJws = await signer.signCompact(payload);
  const credentialHash = createHash('sha256').update(compactJws).digest('hex');

  // 8. Store the exact signed artefact. A database trigger writes the status
  //    row and the 'issued' credential event, so a credential cannot exist
  //    without its history.
  const { data: stored, error: storeError } = await db
    .from('credentials')
    .insert({
      university_id: request.universityId,
      person_id: person.id,
      card_id: card.id,
      issuer_key_id: key.id,
      jti: claims.jti,
      profile_version: claims.v,
      claims,
      compact_jws: compactJws,
      credential_hash: credentialHash,
      status_list_index: statusListIndex,
      issued_at: issuedAt.toISOString(),
      expires_at: new Date(claims.exp * 1000).toISOString(),
      created_by: request.actorId,
    })
    .select('id')
    .single<{ id: string }>();

  if (storeError || !stored) {
    throw new IssuanceFailure(
      `Signed, but could not be stored: ${storeError?.message}`,
      'storage_failed',
    );
  }

  return {
    credentialId: stored.id,
    jti: claims.jti,
    compactJws,
    claims,
    credentialHash,
    qr: planQr(compactJws),
    cardId: card.id,
    sequenceNo,
  };
}
