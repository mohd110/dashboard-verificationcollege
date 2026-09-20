'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import type { ActionState } from '@/lib/action-state';
import { EnvKeySigner } from '@/lib/crypto/env-signer';
import { recordCampusEvent } from '@/lib/events';
import { IssuanceFailure, issueCredential } from '@/lib/issuance/issue';
import {
  REVOCATION_REASONS,
  RevocationError,
  setCredentialStatus,
  type RevocationReason,
} from '@/lib/issuance/revoke';
import { assertRecordsCapability } from '@/lib/records/access';
import { createClient } from '@/lib/supabase/server';

/**
 * Issuing and blocking a card from the records office.
 *
 * The same two library calls the admin dashboard makes, behind a different
 * gate: a card operator may issue and a revocation officer may block, where
 * the admin screens require an administrator. Both write through the same
 * supabase client the caller is signed in as, so row level security has the
 * final say either way and this only decides which button to show.
 *
 * The order matters, and matches the admin path deliberately. The credential
 * is written first and the campus event second, because the alternative is a
 * printed card the activity trail says nothing about.
 */

const issueRequest = z.object({ personId: z.uuid() });

export async function issueCardFromRecords(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertRecordsCapability('credentials.issue');

  const parsed = issueRequest.safeParse({ personId: formData.get('personId') });
  if (!parsed.success) return { error: 'That student could not be identified.', message: null };

  let signer: EnvKeySigner;
  try {
    signer = EnvKeySigner.fromEnv();
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `${error.message} Then restart the server.`
          : 'No signing key is configured.',
      message: null,
    };
  }

  const supabase = await createClient();
  let issued;

  try {
    issued = await issueCredential(supabase, signer, {
      personId: parsed.data.personId,
      universityId: session.universityId,
      issuerCode: session.universityCode.slice(0, 4),
      actorId: session.userId,
    });
  } catch (error) {
    if (error instanceof IssuanceFailure) return { error: error.message, message: null };

    const message = error instanceof Error ? error.message : '';
    if (/row-level security|permission denied/i.test(message)) {
      return { error: 'Your role does not permit issuing cards.', message: null };
    }
    return { error: 'The card could not be issued.', message: null };
  }

  try {
    await recordCampusEvent({
      eventType: 'CARD_ISSUED',
      result: 'SUCCESS',
      personId: parsed.data.personId,
      entityType: 'credential',
      entityId: issued.credentialId,
      metadata: {
        jti: issued.jti,
        card_sequence: issued.sequenceNo,
        signing_kid: signer.kid,
        credential_hash: issued.credentialHash,
        qr_version: issued.qr.version,
        desk: 'records_office',
      },
    });
  } catch (error) {
    return {
      error: `The card was issued, but the activity record failed: ${
        error instanceof Error ? error.message : 'unknown reason'
      }`,
      message: null,
    };
  }

  revalidatePath('/records');
  revalidatePath('/records/cards');
  revalidatePath(`/records/students/${parsed.data.personId}`);

  redirect(`/records/students/${parsed.data.personId}?issued=1`);
}

const statusRequest = z.object({
  credentialId: z.uuid(),
  targetStatus: z.enum(['revoked', 'suspended', 'active']),
  reasonCode: z.enum(REVOCATION_REASONS),
});

/**
 * Blocks, suspends or reinstates a card.
 *
 * Every verifier reads credential_status live at the point of scan, so a card
 * blocked here stops at the gate and at the library desk on the next
 * presentation, with no deployment and no cache to wait for.
 */
export async function setCardStatusFromRecords(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertRecordsCapability('credentials.revoke');

  const parsed = statusRequest.safeParse({
    credentialId: formData.get('credentialId'),
    targetStatus: formData.get('targetStatus'),
    reasonCode: formData.get('reasonCode'),
  });

  if (!parsed.success) {
    return { error: 'Choose a reason before changing a card.', message: null };
  }

  const supabase = await createClient();
  let result;

  try {
    result = await setCredentialStatus(supabase, {
      credentialId: parsed.data.credentialId,
      universityId: session.universityId,
      targetStatus: parsed.data.targetStatus,
      reasonCode: parsed.data.reasonCode as RevocationReason,
      actorId: session.userId,
    });
  } catch (error) {
    if (error instanceof RevocationError) return { error: error.message, message: null };

    const message = error instanceof Error ? error.message : '';
    if (/row-level security|permission denied/i.test(message)) {
      return { error: 'Your role does not permit blocking cards.', message: null };
    }
    return { error: 'The card status could not be changed.', message: null };
  }

  try {
    await recordCampusEvent({
      eventType: 'CARD_BLOCKED',
      result: parsed.data.targetStatus === 'active' ? 'SUCCESS' : 'REVOKED',
      personId: result.personId,
      entityType: 'credential',
      entityId: result.credentialId,
      metadata: {
        jti: result.jti,
        new_status: result.status,
        reason: result.reasonCode,
        desk: 'records_office',
      },
    });
  } catch (error) {
    return {
      error: `The status changed, but the activity record failed: ${
        error instanceof Error ? error.message : 'unknown reason'
      }`,
      message: null,
    };
  }

  revalidatePath('/records/cards');
  revalidatePath('/records/activity');
  if (result.personId) revalidatePath(`/records/students/${result.personId}`);

  const words = { revoked: 'blocked', suspended: 'suspended', active: 'reinstated' } as const;
  return { error: null, message: `Card ${words[parsed.data.targetStatus]}.` };
}
