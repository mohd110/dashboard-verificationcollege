/**
 * The contract between this dashboard and the credential subsystem.
 *
 * Saif owns credential signing, QR decoding, signature checking, issuer and
 * expiry checking and revocation. Nothing on this side does cryptography, and
 * nothing on this side should ever start doing it. These are the types and the
 * pure mappings that both sides agree on; the providers live in verify.ts.
 */

import type { CampusEventResult } from '@/lib/types';

/** State of the credential itself. */
export type CredentialStatus = 'VALID' | 'REVOKED' | 'EXPIRED' | 'UNKNOWN';

/**
 * The holder as the register knows them.
 *
 * Distinct from subjectName/subjectCode, which are what the *card* claims.
 * The library desk shows both, because a card whose claims disagree with the
 * register is exactly the case a librarian needs to notice.
 */
export type VerificationPerson = {
  id: string;
  studentId: string | null;
  fullName: string | null;
  department: string | null;
  status: string;
};

/** Outcome of the whole check. Maps one to one onto campus_event_result. */
export type VerificationOutcome = 'VALID' | 'INVALID' | 'REVOKED' | 'EXPIRED' | 'UNVERIFIABLE';

export type VerificationResult = {
  verified: boolean;
  /** people.id, when the payload identified somebody. */
  personId: string | null;
  credentialId: string | null;
  status: CredentialStatus;
  verificationResult: VerificationOutcome;
  verifiedAt: string;
  /** Shown to the operator, so it has to read as plain English. */
  reason: string;
  /** Recorded in event metadata so a stored result stays self-describing. */
  provider: string;
  /** False whenever no digital signature was checked. */
  signatureChecked: boolean;
  /**
   * The name and number on the card, present only once a signature verified or
   * a register lookup succeeded. Shown at the gate so the operator can compare
   * the screen with the face in front of them.
   */
  subjectName?: string | null;
  subjectCode?: string | null;
  /** The holder, resolved from the register. Absent until something identified them. */
  person?: VerificationPerson | null;
  /** Which key signed the card, when that could be determined. */
  keyId?: string | null;
  /**
   * The cryptographic verdict before it is collapsed onto a campus outcome.
   *
   * verificationResult maps several distinct states onto INVALID, which is the
   * right thing for the activity trail but throws away what the gate needs:
   * a tampered card, a card from another institution and an unreadable one all
   * call for different responses from the person holding it.
   */
  state?: VerificationState | null;
};

/** The states lib/crypto/verify can return. */
export type VerificationState =
  | 'VALID'
  | 'EXPIRED'
  | 'REVOKED'
  | 'SUSPENDED'
  | 'INVALID_SIGNATURE'
  | 'UNKNOWN_ISSUER'
  | 'KEY_REVOKED'
  | 'MALFORMED'
  | 'UNSUPPORTED_PROFILE'
  | 'WRONG_ISSUER';

/** UNVERIFIABLE means nothing was decided, so nothing is written to history. */
export function isRecordable(result: VerificationResult): boolean {
  return result.verificationResult !== 'UNVERIFIABLE';
}

export function outcomeToEventResult(outcome: VerificationOutcome): CampusEventResult {
  switch (outcome) {
    case 'VALID':
      return 'VALID';
    case 'REVOKED':
      return 'REVOKED';
    case 'EXPIRED':
      return 'EXPIRED';
    default:
      return 'INVALID';
  }
}
