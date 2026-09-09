'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { recordCampusEvent } from '@/lib/events';
import { getStaffSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { CampusEventType } from '@/lib/types';
import { isRecordable, outcomeToEventResult } from '@/lib/verification/contract';
import { verifyCredential } from '@/lib/verification/verify';

export type ScanState = {
  outcome: 'idle' | 'accepted' | 'rejected' | 'blocked';
  headline: string;
  detail: string;
  studentName: string | null;
  studentCode: string | null;
  chainPosition: number | null;
  /** True when the decision was made without checking a signature. */
  provisional: boolean;
};

export const idleScan: ScanState = {
  outcome: 'idle',
  headline: '',
  detail: '',
  studentName: null,
  studentCode: null,
  chainPosition: null,
  provisional: false,
};

function blocked(detail: string): ScanState {
  return { ...idleScan, outcome: 'blocked', headline: 'Nothing recorded', detail };
}

const scan = z.object({
  payload: z.string().trim().min(1, 'Scan a card or type a student ID.').max(4096),
});

/**
 * One scan at the gate or the library entrance.
 *
 * The credential subsystem decides whether the card is genuine. This action
 * only turns that decision into a campus event, which is the split the team
 * handoff asks for: one side verifies, the other side records.
 */
export async function submitScan(_state: ScanState, formData: FormData): Promise<ScanState> {
  const session = await getStaffSession();

  if (!session || session.status !== 'active') {
    return blocked('Your session has ended. Sign in again.');
  }

  if (!session.posting) {
    return blocked('You are not posted to a location, so scans cannot be attributed anywhere.');
  }

  const parsed = scan.safeParse({ payload: formData.get('payload') });
  if (!parsed.success) {
    return blocked(parsed.error.issues[0].message);
  }

  const result = await verifyCredential(parsed.data.payload);

  // An unverifiable scan means the check could not be made at all. Writing a
  // rejection would blame the student for a problem on our side.
  if (!isRecordable(result)) {
    return blocked(result.reason);
  }

  const atLibrary = session.posting.type === 'library';
  const eventType: CampusEventType = result.verified
    ? atLibrary
      ? 'LIBRARY_ENTRY'
      : 'IDENTITY_VERIFIED'
    : 'IDENTITY_REJECTED';

  const eventResult = result.verified && atLibrary ? 'SUCCESS' : outcomeToEventResult(result.verificationResult);

  let student: { full_name: string; person_code: string } | null = null;
  if (result.personId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('people')
      .select('full_name, person_code')
      .eq('id', result.personId)
      .maybeSingle();
    student = data;
  }

  let recorded;
  try {
    recorded = await recordCampusEvent({
      eventType,
      result: eventResult,
      personId: result.personId,
      locationId: session.posting.id,
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
    return blocked(error instanceof Error ? error.message : 'The event could not be recorded.');
  }

  revalidatePath('/console');

  return {
    outcome: result.verified ? 'accepted' : 'rejected',
    headline: result.verified ? (atLibrary ? 'ENTRY ALLOWED' : 'VALID') : result.verificationResult,
    detail: result.reason,
    studentName: student?.full_name ?? null,
    studentCode: student?.person_code ?? null,
    chainPosition: recorded.seq,
    provisional: !result.signatureChecked,
  };
}
