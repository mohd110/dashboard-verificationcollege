'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { UnifiedVerificationResponse } from '@/lib/guard/contract';
import { recordCampusEvent } from '@/lib/events';
import { getStaffSession } from '@/lib/session';
import { outcomeToEventResult, isRecordable } from '@/lib/verification/contract';
import { verifyCredential } from '@/lib/verification/verify';

/**
 * One scan at the gate.
 *
 * The guard application used to POST to its own /api/credentials/verify and
 * then, separately and optionally, to an /api/events stub that recorded
 * nothing. So a gate check never reached the activity trail, and the admin
 * dashboard could not see that the gate had been worked at all.
 *
 * It is now one server action doing both, over the same verification module
 * the library desk and the console use and the same record_campus_event the
 * whole platform writes through. A scan here appears in the admin activity
 * trail, in the student's history and in the integrity chain, with no
 * integration between the two applications beyond this file.
 */

const scan = z.object({
  payload: z.string().trim().min(1, 'Scan a card, or type the printed student number.').max(4096),
});

function refusal(reason: string): UnifiedVerificationResponse {
  return {
    verified: false,
    state: 'MALFORMED',
    reason,
    verifiedAt: new Date(),
    signatureChecked: false,
    chainPosition: null,
  };
}

export async function verifyAtGate(payload: string): Promise<UnifiedVerificationResponse> {
  const session = await getStaffSession();

  if (!session || session.status !== 'active') {
    return refusal('Your session has ended. Sign in again.');
  }
  if (!session.posting) {
    return refusal('You are not posted to a gate, so a scan would have nowhere to be recorded.');
  }

  const parsed = scan.safeParse({ payload });
  if (!parsed.success) return refusal(parsed.error.issues[0].message);

  const result = await verifyCredential(
    parsed.data.payload,
    session.universityCode.slice(0, 4) || undefined,
  );

  const base: UnifiedVerificationResponse = {
    verified: result.verified,
    state: result.state ?? (result.verified ? 'VALID' : 'INVALID_SIGNATURE'),
    personId: result.personId ?? undefined,
    credentialId: result.credentialId ?? undefined,
    name: result.person?.fullName ?? result.subjectName ?? undefined,
    studentNumber: result.person?.studentId ?? result.subjectCode ?? undefined,
    departmentCode: result.person?.department ?? undefined,
    reason: result.reason,
    verifiedAt: new Date(result.verifiedAt),
    signatureChecked: result.signatureChecked,
    chainPosition: null,
  };

  // UNVERIFIABLE means the check could not be made at all — a key set that
  // would not load, a register that would not answer. Writing a rejection
  // would blame the student for a failure on our side.
  if (!isRecordable(result)) {
    return { ...base, recordError: null };
  }

  // A library posting records an entry; a gate records an identity check. The
  // same guard screen therefore works at either, which is what the console
  // already does for the same reason.
  const atLibrary = session.posting.type === 'library';
  const eventType = result.verified
    ? atLibrary
      ? ('LIBRARY_ENTRY' as const)
      : ('IDENTITY_VERIFIED' as const)
    : ('IDENTITY_REJECTED' as const);

  try {
    const recorded = await recordCampusEvent({
      eventType,
      result:
        result.verified && atLibrary
          ? 'SUCCESS'
          : outcomeToEventResult(result.verificationResult),
      personId: result.personId,
      locationId: session.posting.id,
      entityType: result.credentialId ? 'credential' : null,
      entityId: result.credentialId,
      metadata: {
        verification_provider: result.provider,
        signature_checked: result.signatureChecked,
        credential_status: result.status,
        key_id: result.keyId ?? null,
        reason: result.reason,
        desk: 'gate_app',
      },
      occurredAt: new Date(result.verifiedAt),
      systemActor: eventType === 'LIBRARY_ENTRY',
    });

    revalidatePath('/guard');
    return { ...base, chainPosition: recorded.seq, recordError: null };
  } catch (error) {
    // The guard has already seen the verdict and the student is standing
    // there. Losing the log entry is reported, not turned into a rejection.
    return {
      ...base,
      recordError: error instanceof Error ? error.message : 'The scan could not be recorded.',
    };
  }
}
