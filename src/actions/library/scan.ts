'use server';

import { z } from 'zod';

import { expectedIssuer, getLibrarianContext } from '@/lib/auth/librarian';
import { tryRecordCampusEvent } from '@/lib/campus-events/adapter';
import { createServiceClient } from '@/lib/supabase/server';
import { allowsPrintedNumbers, verifyScannedCard } from '@/lib/verification/verify';
import { isRecordable, outcomeToEventResult } from '@/lib/verification/contract';
import type { VerificationResult } from '@/lib/verification/contract';

import { idleScan, type ScannedStudent, type ScanState } from './scan-state';

/**
 * One card scan at the issue desk.
 *
 * The credential subsystem decides whether the card is genuine; this action
 * only turns that decision into a campus event and hands the librarian a
 * student to act on. Identifying somebody is a scan, not a menu: a librarian
 * picking a name out of a list has verified nothing at all.
 */

const scan = z.object({
  payload: z.string().trim().min(1, 'Scan a card, or type the printed student number.').max(4096),
});

function blocked(detail: string, scanId: number): ScanState {
  return { ...idleScan, outcome: 'blocked', headline: 'Nothing recorded', detail, scanId };
}

/**
 * The library still needs the student's email to send a notification, and the
 * verification helpers do not return one — a credential carries no contact
 * details, by design. It is read here, once the identity is settled.
 */
async function loadStudent(personId: string, universityId: string): Promise<ScannedStudent | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from('people')
    .select('id, student_id, full_name, email, department, status')
    .eq('id', personId)
    .eq('university_id', universityId)
    .maybeSingle();

  return (data as ScannedStudent) ?? null;
}

export async function submitScan(state: ScanState, formData: FormData): Promise<ScanState> {
  const scanId = (state?.scanId ?? 0) + 1;

  let librarian;
  try {
    librarian = await getLibrarianContext();
  } catch (error) {
    return blocked(
      error instanceof Error ? error.message : 'Your session has ended. Sign in again.',
      scanId,
    );
  }

  const parsed = scan.safeParse({ payload: formData.get('payload') });
  if (!parsed.success) return blocked(parsed.error.issues[0].message, scanId);

  let result: VerificationResult;
  try {
    result = await verifyScannedCard(parsed.data.payload, expectedIssuer(librarian));
  } catch (error) {
    return blocked(
      error instanceof Error ? error.message : 'The card could not be checked.',
      scanId,
    );
  }

  // An unverifiable scan means the check could not be made at all. Writing a
  // rejection would blame the student for a problem on our side.
  if (!isRecordable(result)) return blocked(result.reason, scanId);

  const recorded = await tryRecordCampusEvent({
    eventType: result.verified ? 'IDENTITY_VERIFIED' : 'IDENTITY_REJECTED',
    result: outcomeToEventResult(result.verificationResult),
    personId: result.personId,
    locationId: librarian.locationId,
    entityType: result.credentialId ? 'credential' : null,
    entityId: result.credentialId,
    metadata: {
      verification_provider: result.provider,
      signature_checked: result.signatureChecked,
      credential_status: result.status,
      key_id: result.keyId ?? null,
      reason: result.reason,
      desk: 'library_issue',
    },
    occurredAt: result.verifiedAt,
  });

  const student =
    result.verified && result.personId
      ? await loadStudent(result.personId, librarian.universityId)
      : null;

  // A card that verified but whose holder has no record on this campus is not
  // somebody the desk may serve, whatever the signature says.
  if (result.verified && !student) {
    return {
      ...blocked('This card verified, but no student record on this campus matches it.', scanId),
      outcome: 'rejected',
      headline: 'NOT ON REGISTER',
      signatureChecked: result.signatureChecked,
      credentialStatus: result.status,
      chainPosition: recorded.event?.seq ?? null,
    };
  }

  return {
    outcome: result.verified ? 'accepted' : 'rejected',
    // An unsigned lookup never reads as a clean pass. The card was not checked;
    // only the number was found on the register.
    headline: result.verified
      ? result.signatureChecked
        ? 'CARD VERIFIED'
        : 'NUMBER FOUND — NO CARD CHECKED'
      : result.verificationResult,
    detail: recorded.success
      ? result.reason
      : `${result.reason} The scan itself could not be logged: ${recorded.error}`,
    signatureChecked: result.signatureChecked,
    credentialStatus: result.status,
    student,
    chainPosition: recorded.event?.seq ?? null,
    scanId,
  };
}

/** Whether the desk accepts a typed student number as well as a scanned card. */
export async function printedNumbersAllowed(): Promise<boolean> {
  return allowsPrintedNumbers();
}
