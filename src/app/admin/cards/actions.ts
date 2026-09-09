'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import type { ActionState } from '@/lib/action-state';
import { forgetIssuerKeys } from '@/lib/crypto/keys';
import { EnvKeySigner } from '@/lib/crypto/env-signer';
import { recordCampusEvent } from '@/lib/events';
import { IssuanceFailure, issueCredential } from '@/lib/issuance/issue';
import {
  REVOCATION_REASONS,
  RevocationError,
  setCredentialStatus,
  type RevocationReason,
} from '@/lib/issuance/revoke';
import { assertAdminForAction } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

/**
 * Issuing and blocking a student card.
 *
 * The credential half of this is a port of the issuer in Saif's verification
 * dashboard and writes to exactly the same tables, so a card made here is a
 * card made there. What is added on this side is the campus event: a
 * CARD_ISSUED or CARD_BLOCKED record on the student's activity trail, sealed
 * into the same hash chain as every gate scan and library transaction.
 *
 * The order matters. The credential is written first and the event second. If
 * the event fails, the card still exists and the failure is reported, because
 * the alternative is a printed card the trail says nothing about.
 */

const issueRequest = z.object({ personId: z.uuid() });

export async function issueCard(_state: ActionState, formData: FormData): Promise<ActionState> {
  const session = await assertAdminForAction();

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
      // The issuer code on the card is four characters at most, by profile.
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

  revalidatePath('/admin/students');
  revalidatePath(`/admin/students/${parsed.data.personId}`);
  revalidatePath('/admin/cards');

  redirect(`/admin/cards/${issued.credentialId}`);
}

const statusRequest = z.object({
  credentialId: z.uuid(),
  targetStatus: z.enum(['revoked', 'suspended', 'active']),
  reasonCode: z.enum(REVOCATION_REASONS),
});

/**
 * Blocks, suspends or reinstates a credential.
 *
 * This is the write path the handoff calls the missing half of revocation. The
 * verifier reads credential_status on every scan, so a card blocked here stops
 * at the gate on the next presentation, in this dashboard and in Saif's
 * verifier alike.
 */
export async function setCardStatus(_state: ActionState, formData: FormData): Promise<ActionState> {
  const session = await assertAdminForAction();

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

  // Reinstatement is a card event too, so the trail shows both directions.
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

  revalidatePath('/admin/cards');
  revalidatePath(`/admin/cards/${result.credentialId}`);
  revalidatePath(`/admin/students/${result.personId}`);

  const words = {
    revoked: 'blocked',
    suspended: 'suspended',
    active: 'reinstated',
  } as const;

  return { error: null, message: `Card ${words[parsed.data.targetStatus]}.` };
}

/** Called after a key rotation, so the next scan uses the new key set. */
export async function refreshIssuerKeys(): Promise<void> {
  await assertAdminForAction();
  forgetIssuerKeys();
}
