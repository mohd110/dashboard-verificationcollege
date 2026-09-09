/**
 * Turns a student record into the claims that go on a card.
 *
 * This is where data minimisation actually happens. The input is a full
 * student record; the output is the smallest set of claims a gate needs.
 * Every field not copied across is a field that never reaches a QR code.
 *
 * Pure. No key material, no database, no clock of its own — `now` is passed
 * in so credentials are reproducible in tests and in an investigation.
 */

import {
  PROFILE_VERSION,
  MAX_NAME_CHARS,
  assertValidProfile,
  type CompactCredential,
  type SubjectRole,
} from './profile';
import { toBase64Url } from './codec';

/**
 * The subset of a student record that issuance is allowed to see.
 *
 * Typed narrowly on purpose: the builder cannot leak a date of birth onto a
 * card because it is never given one.
 */
export interface IssuanceSubject {
  studentNumber: string;
  givenName: string;
  familyName: string;
  departmentCode: string;
  role: SubjectRole;
  cardSequence: number;
}

export interface IssuanceContext {
  issuerCode: string;
  /** 16 random bytes. Supplied by the caller so tests can be deterministic. */
  credentialId: Uint8Array;
  /** SHA-256 of the photograph, truncated to its first 16 bytes. */
  photoHash: Uint8Array;
  statusListIndex: number;
  issuedAt: Date;
  expiresAt: Date;
}

export class IssuanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IssuanceError';
  }
}

/** Display name, normalised. One space, trimmed, collapsed. */
export function displayName(givenName: string, familyName: string): string {
  return `${givenName} ${familyName}`.replace(/\s+/g, ' ').trim();
}

/**
 * Fits a name into the space a card has.
 *
 * Physical ID documents shorten long names — passports do it too — because the
 * space is finite. What matters is that it is done ONCE, deterministically, and
 * that the printed card and the signed credential use the SAME result. If they
 * disagreed, a guard would see a mismatch between the card and the screen on a
 * perfectly genuine credential.
 *
 * Three steps, in order:
 *   "Konstantinos Papadopoulos-Nakamura"  full name, if it fits
 *   "K. Papadopoulos-Nakamura"            initial, if that fits
 *   "K. Papadopoulos-Nakamu"              hard cut, as a last resort
 */
export function fitDisplayName(
  givenName: string,
  familyName: string,
  maxChars: number = MAX_NAME_CHARS,
): string {
  const given = givenName.replace(/\s+/g, ' ').trim();
  const family = familyName.replace(/\s+/g, ' ').trim();

  const full = displayName(given, family);
  if (full.length <= maxChars) return full;

  const initial = given.charAt(0).toUpperCase();
  const abbreviated = `${initial}. ${family}`;
  if (abbreviated.length <= maxChars) return abbreviated;

  return abbreviated.slice(0, maxChars).trimEnd();
}

const toEpochSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

export function buildCredential(
  subject: IssuanceSubject,
  context: IssuanceContext,
): CompactCredential {
  if (context.credentialId.length !== 16) {
    throw new IssuanceError(
      `credentialId must be 16 bytes (128 bits), got ${context.credentialId.length}`,
    );
  }
  if (context.photoHash.length !== 16) {
    throw new IssuanceError(
      `photoHash must be the first 16 bytes of a SHA-256 digest, got ${context.photoHash.length}`,
    );
  }
  if (context.expiresAt <= context.issuedAt) {
    throw new IssuanceError('expiresAt must be after issuedAt');
  }

  const claims: CompactCredential = {
    v: PROFILE_VERSION,
    iss: context.issuerCode,
    jti: toBase64Url(context.credentialId),
    sn: subject.studentNumber,
    nm: fitDisplayName(subject.givenName, subject.familyName),
    dp: subject.departmentCode,
    rl: subject.role,
    sq: subject.cardSequence,
    iat: toEpochSeconds(context.issuedAt),
    exp: toEpochSeconds(context.expiresAt),
    ph: toBase64Url(context.photoHash),
    st: context.statusListIndex,
  };

  assertValidProfile(claims);
  return claims;
}

/**
 * Expiry at the end of an academic year.
 *
 * Short expiry is defence in depth: it is more reliable than revocation,
 * because it needs nobody to remember to do anything. A leaver's card stops
 * working on its own even if the revocation was missed.
 */
export function endOfAcademicYear(from: Date, monthsValid = 12): Date {
  const expiry = new Date(from);
  expiry.setUTCMonth(expiry.getUTCMonth() + monthsValid);
  return expiry;
}

/**
 * The canonical W3C VCDM 2.0 projection of a compact credential.
 *
 * Stored and exported, never printed and never signed — see ADR 0001. It
 * exists so a third party can consume a credential with standard tooling, and
 * so the tender's likely "W3C conformance" requirement has a concrete answer.
 */
export function toVerifiableCredential(
  claims: CompactCredential,
  issuerDid: string,
): Record<string, unknown> {
  return {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    type: ['VerifiableCredential', 'StudentIdentityCredential'],
    id: `urn:uuid:${claims.jti}`,
    issuer: issuerDid,
    validFrom: new Date(claims.iat * 1000).toISOString(),
    validUntil: new Date(claims.exp * 1000).toISOString(),
    credentialSubject: {
      type: claims.rl === 's' ? 'Student' : 'StaffMember',
      identifier: claims.sn,
      name: claims.nm,
      department: claims.dp,
      cardSequence: claims.sq,
    },
    credentialStatus: {
      type: 'BitstringStatusListEntry',
      statusPurpose: 'revocation',
      statusListIndex: String(claims.st),
    },
  };
}
