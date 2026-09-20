/**
 * The shape the guard screens read a scan in.
 *
 * The guard application was built against its own verification service and
 * this is the response type it expects. Keeping the type lets every one of its
 * screens port across untouched; the values inside it now come from this
 * project's verification module, so the gate, the library desk and the admin
 * dashboard all reach their verdict by the same route.
 *
 * `state` is the cryptographic verdict, which is finer-grained than the
 * campus event result: the modal uses it to tell a guard whether they are
 * looking at a tampered card, an expired one or a blocked one, and each of
 * those means something different to do next.
 */

import type { CompactCredential } from '@/lib/credential/profile';

export type GuardVerificationState =
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

export interface UnifiedVerificationResponse {
  verified: boolean;
  state: GuardVerificationState;
  /** `people.id`, a uuid. Absent when the holder could not be resolved. */
  personId?: string;
  studentNumber?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  departmentCode?: string;
  /** `credentials.id`, a uuid. Absent when the credential is not in this database. */
  credentialId?: string;
  jti?: string;
  reason?: string;
  verifiedAt: Date;
  /**
   * False whenever no signature was actually checked — a number typed by hand,
   * for instance. The modal must never show a clean cryptographic pass for one.
   */
  signatureChecked?: boolean;
  /**
   * Position in the campus hash chain, once the scan has been recorded. Null
   * means the verdict was reached but the event was not written, which the
   * guard is told about rather than left to assume.
   */
  chainPosition?: number | null;
  /** Set when the scan produced a verdict but recording it failed. */
  recordError?: string | null;
  /**
   * The claims on the card itself, present only once a signature verified.
   *
   * The modal shows these beside the register's view of the same student, so a
   * card whose printed details no longer match the record is visible rather
   * than quietly reconciled.
   */
  claims?: CompactCredential;
}
