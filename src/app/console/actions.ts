'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { recordCampusEvent } from '@/lib/events';
import { getStaffSession } from '@/lib/session';
import type { CampusEventType } from '@/lib/types';
import { isRecordable, outcomeToEventResult } from '@/lib/verification/contract';
import { verifyCredential } from '@/lib/verification/verify';

import { idleScan, type ScanState } from './scan-state';

function blocked(detail: string, scanId: number): ScanState {
  return { ...idleScan, outcome: 'blocked', headline: 'Nothing recorded', detail, scanId };
}

const scan = z.object({
  payload: z.string().trim().min(1, 'Scan a card or type a student number.').max(4096),
});

/**
 * One scan at the gate or the library entrance.
 *
 * The credential subsystem decides whether the card is genuine. This action
 * only turns that decision into a campus event, which is the split the team
 * handoff asks for: one side verifies, the other side records.
 */
export async function submitScan(state: ScanState, formData: FormData): Promise<ScanState> {
  const scanId = state.scanId + 1;
  const session = await getStaffSession();

  if (!session || session.status !== 'active') {
    return blocked('Your session has ended. Sign in again.', scanId);
  }

  if (!session.posting) {
    return blocked(
      'You are not posted to a location, so scans cannot be attributed anywhere.',
      scanId,
    );
  }

  const parsed = scan.safeParse({ payload: formData.get('payload') });
  if (!parsed.success) return blocked(parsed.error.issues[0].message, scanId);

  const result = await verifyCredential(
    parsed.data.payload,
    session.universityCode.slice(0, 4) || undefined,
  );

  // An unverifiable scan means the check could not be made at all. Writing a
  // rejection would blame the student for a problem on our side.
  if (!isRecordable(result)) return blocked(result.reason, scanId);

  const atLibrary = session.posting.type === 'library';
  const eventType: CampusEventType = result.verified
    ? atLibrary
      ? 'LIBRARY_ENTRY'
      : 'IDENTITY_VERIFIED'
    : 'IDENTITY_REJECTED';

  const eventResult =
    result.verified && atLibrary ? 'SUCCESS' : outcomeToEventResult(result.verificationResult);

  let recorded;
  try {
    recorded = await recordCampusEvent({
      eventType,
      result: eventResult,
      personId: result.personId,
      locationId: session.posting.id,
      entityType: result.credentialId ? 'credential' : null,
      entityId: result.credentialId,
      metadata: {
        verification_provider: result.provider,
        signature_checked: result.signatureChecked,
        credential_status: result.status,
        reason: result.reason,
      },
      occurredAt: new Date(result.verifiedAt),
      // A library turnstile opens by itself; a gate is worked by a person.
      systemActor: eventType === 'LIBRARY_ENTRY',
    });
  } catch (error) {
    return blocked(
      error instanceof Error ? error.message : 'The event could not be recorded.',
      scanId,
    );
  }

  revalidatePath('/console');

  return {
    outcome: result.verified ? 'accepted' : 'rejected',
    headline: result.verified ? (atLibrary ? 'ENTRY ALLOWED' : 'VALID') : result.verificationResult,
    detail: result.reason,
    studentName: result.subjectName ?? null,
    studentCode: result.subjectCode ?? null,
    chainPosition: recorded.seq,
    provisional: !result.signatureChecked,
    scanId,
  };
}
