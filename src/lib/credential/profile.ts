/**
 * The compact credential profile. See docs/adr/0001-compact-credential-profile.md.
 *
 * This module is pure: no key material, no database, no network, no framework.
 * It must stay importable by the verifier running on a guard's phone.
 */

/** Bump when the meaning of any claim changes. Verifiers reject what they do not know. */
export const PROFILE_VERSION = 1;

/**
 * Hard size limit for the encoded credential, in characters.
 *
 * 450 is byte-mode capacity of a version-16 QR at error correction level M —
 * an 81x81 grid, about 0.37 mm per module on a 30 mm printed square. Exceeding
 * it pushes the card to a denser code that a phone camera struggles with in
 * poor light. Enforced by test, not by hope.
 */
export const MAX_ENCODED_CHARS = 450;

/** Warn before the cliff, so a claim change is noticed in review. */
export const ENCODED_BUDGET_WARNING = 440;

/**
 * Per-field limits.
 *
 * These are not independent. Their SUM has to fit `MAX_ENCODED_CHARS` once
 * base64 expansion (×4/3), the header and the signature are added — an
 * earlier draft set them field by field and the total came out 12 characters
 * over. A test builds a credential at every one of these limits at once and
 * fails the build if the total no longer fits, so the two can never drift
 * apart again.
 */
export const MAX_ISSUER_CHARS = 4;
export const MAX_KID_CHARS = 12;
export const MAX_STUDENT_NUMBER_CHARS = 12;
export const MAX_NAME_CHARS = 32;
export const MAX_DEPARTMENT_CHARS = 6;
export const MAX_CARD_SEQUENCE = 99;
export const MAX_STATUS_INDEX = 999_999;

export type SubjectRole = 's' | 'f';

/**
 * The claims exactly as they are signed and printed.
 *
 * Key order is fixed by `CLAIM_ORDER` below so that encoding is deterministic:
 * the same input must always produce the same bytes, or a credential could not
 * be re-derived and compared during an investigation.
 */
export interface CompactCredential {
  /** Profile version. */
  v: number;
  /** Issuer code, e.g. "northfield". */
  iss: string;
  /** Credential id — 128 bits of randomness, base64url, 22 characters. */
  jti: string;
  /** Student or staff number. */
  sn: string;
  /** Full display name, as printed on the card. */
  nm: string;
  /** Department code, e.g. "CS". */
  dp: string;
  /** Subject role. */
  rl: SubjectRole;
  /** Card sequence number — increments on every reissue. */
  sq: number;
  /** Issued at, epoch seconds. */
  iat: number;
  /** Expires at, epoch seconds. */
  exp: number;
  /** Photograph hash: SHA-256 truncated to 128 bits, base64url, 22 characters. */
  ph: string;
  /** Index into the revocation status list. */
  st: number;
}

/**
 * Canonical key order. Deterministic encoding depends on it, so it is declared
 * once here rather than relying on object insertion order.
 */
export const CLAIM_ORDER = [
  'v',
  'iss',
  'jti',
  'sn',
  'nm',
  'dp',
  'rl',
  'sq',
  'iat',
  'exp',
  'ph',
  'st',
] as const satisfies ReadonlyArray<keyof CompactCredential>;

/** Claims that must never appear. Guards against a well-meaning future addition. */
export const FORBIDDEN_CLAIMS = [
  'dob',
  'date_of_birth',
  'email',
  'phone',
  'address',
  'programme',
  'photo',
  'ph_raw',
] as const;

export class CredentialProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialProfileError';
  }
}

const B64URL_22 = /^[A-Za-z0-9_-]{22}$/;

/**
 * Validates a credential against the profile.
 *
 * Called on the way out (before signing) and on the way in (after a signature
 * verifies). The inbound check matters: a valid signature proves the issuer
 * wrote these bytes, not that the bytes are shaped as this version expects.
 */
export function assertValidProfile(claims: CompactCredential): void {
  const fail = (message: string) => {
    throw new CredentialProfileError(message);
  };

  if (claims.v !== PROFILE_VERSION) {
    fail(`unsupported profile version ${claims.v}; this build understands ${PROFILE_VERSION}`);
  }
  if (!claims.iss || claims.iss.length > MAX_ISSUER_CHARS) {
    fail(`iss must be 1..${MAX_ISSUER_CHARS} characters — it is a code, not a name`);
  }
  if (!B64URL_22.test(claims.jti)) fail('jti must be 22 base64url characters (128 bits)');
  if (!B64URL_22.test(claims.ph)) fail('ph must be 22 base64url characters (128 bits)');
  if (!claims.sn || claims.sn.length > MAX_STUDENT_NUMBER_CHARS) {
    fail(`sn must be 1..${MAX_STUDENT_NUMBER_CHARS} characters`);
  }
  if (!claims.nm || claims.nm.length > MAX_NAME_CHARS) {
    fail(`nm must be 1..${MAX_NAME_CHARS} characters — use fitDisplayName()`);
  }
  if (!claims.dp || claims.dp.length > MAX_DEPARTMENT_CHARS) {
    fail(`dp must be 1..${MAX_DEPARTMENT_CHARS} characters`);
  }
  if (claims.rl !== 's' && claims.rl !== 'f') fail("rl must be 's' or 'f'");
  if (!Number.isInteger(claims.sq) || claims.sq < 1 || claims.sq > MAX_CARD_SEQUENCE) {
    fail(`sq must be an integer 1..${MAX_CARD_SEQUENCE}`);
  }
  if (!Number.isInteger(claims.iat) || claims.iat <= 0) fail('iat must be epoch seconds');
  if (!Number.isInteger(claims.exp) || claims.exp <= 0) fail('exp must be epoch seconds');
  if (claims.exp <= claims.iat) fail('exp must be after iat');
  if (!Number.isInteger(claims.st) || claims.st < 0 || claims.st > MAX_STATUS_INDEX) {
    fail(`st must be an integer 0..${MAX_STATUS_INDEX}`);
  }

  for (const forbidden of FORBIDDEN_CLAIMS) {
    if (forbidden in (claims as unknown as Record<string, unknown>)) {
      fail(
        `claim "${forbidden}" must never appear on a card — a QR code is public. ` +
          `See docs/adr/0001-compact-credential-profile.md`,
      );
    }
  }
}
