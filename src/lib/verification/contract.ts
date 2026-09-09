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
};

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
