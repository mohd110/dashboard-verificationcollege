import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Blocking and reinstating a credential.
 *
 * A port of the same module in Saif's verification dashboard, kept in step
 * with it because both write to the same two tables. The verifier reads
 * credential_status on every scan, so a row written here is what stops a
 * blocked card at the gate.
 *
 * The campus event that records the decision is NOT written here. That belongs
 * to the event system, and is recorded by the caller, so this module stays a
 * credential concern and nothing else.
 */

export const REVOCATION_REASONS = [
  'lost',
  'stolen',
  'damaged',
  'withdrawn',
  'graduated',
  'replaced',
  'issued_in_error',
  'suspended_pending_review',
] as const;

export type RevocationReason = (typeof REVOCATION_REASONS)[number];

export const TARGET_STATUSES = ['revoked', 'suspended', 'active'] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

export const REASON_LABELS: Record<RevocationReason, string> = {
  lost: 'Lost',
  stolen: 'Stolen',
  damaged: 'Damaged',
  withdrawn: 'Student withdrawn',
  graduated: 'Graduated',
  replaced: 'Replaced by a reissue',
  issued_in_error: 'Issued in error',
  suspended_pending_review: 'Suspended pending review',
};

export type SetStatusRequest = {
  credentialId: string;
  universityId: string;
  targetStatus: TargetStatus;
  reasonCode: RevocationReason;
  /** app_users.id of whoever made the decision. */
  actorId?: string;
};

export type SetStatusResult = {
  credentialId: string;
  personId: string;
  jti: string;
  status: TargetStatus;
  reasonCode: RevocationReason;
  changedAt: string;
};

export type RevocationErrorCode = 'no_such_credential' | 'update_failed';

export class RevocationError extends Error {
  constructor(
    message: string,
    readonly code: RevocationErrorCode,
  ) {
    super(message);
    this.name = 'RevocationError';
  }
}

export async function setCredentialStatus(
  db: SupabaseClient,
  request: SetStatusRequest,
): Promise<SetStatusResult> {
  const { credentialId, universityId, targetStatus, reasonCode, actorId } = request;

  // The credential has to be one of ours. Taking the university from the
  // session rather than the request is what makes this check meaningful.
  const { data: credential } = await db
    .from('credentials')
    .select('id, university_id, jti, person_id')
    .eq('id', credentialId)
    .eq('university_id', universityId)
    .maybeSingle<{ id: string; university_id: string; jti: string; person_id: string }>();

  if (!credential) {
    throw new RevocationError('That credential is not on this campus.', 'no_such_credential');
  }

  const now = new Date().toISOString();

  const { error: updateError } = await db.from('credential_status').upsert({
    credential_id: credentialId,
    university_id: universityId,
    status: targetStatus,
    reason_code: reasonCode,
    changed_at: now,
    changed_by: actorId ?? null,
  });

  if (updateError) {
    throw new RevocationError(
      `The status could not be updated: ${updateError.message}`,
      'update_failed',
    );
  }

  // credential_events is the identity subsystem's own hash chain, separate
  // from campus_events. Both get a record: this one proves what happened to
  // the credential, the campus event puts it on the student's trail.
  const eventType =
    targetStatus === 'revoked' ? 'revoked' : targetStatus === 'suspended' ? 'suspended' : 'reinstated';

  await db.from('credential_events').insert({
    university_id: universityId,
    credential_id: credentialId,
    event_type: eventType,
    reason_code: reasonCode,
    actor_id: actorId ?? null,
    occurred_at: now,
  });

  return {
    credentialId,
    personId: credential.person_id,
    jti: credential.jti,
    status: targetStatus,
    reasonCode,
    changedAt: now,
  };
}
