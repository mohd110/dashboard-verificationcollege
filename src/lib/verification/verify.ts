import 'server-only';

import { issuerKeyResolver } from '@/lib/crypto/keys';
import {
  verifyCredential as verifySignedCredential,
  type StatusReading,
  type VerificationState,
} from '@/lib/crypto/verify';
import type { CompactCredential } from '@/lib/credential/profile';
import { QrPayloadError, readScannedPayload } from '@/lib/qr/payload';
import { createClient } from '@/lib/supabase/server';

import type { CredentialStatus, VerificationOutcome, VerificationResult } from './contract';

/**
 * Turning a scan into a decision.
 *
 * The cryptography lives in lib/crypto and is a straight copy of the issuer's
 * own verifier. Nothing here reimplements it. This module chooses the provider,
 * resolves the credential to a person, and shapes the answer into the contract
 * the rest of the dashboard consumes.
 */

const NOW = () => new Date().toISOString();

function unverifiable(reason: string, provider: string): VerificationResult {
  return {
    verified: false,
    personId: null,
    credentialId: null,
    status: 'UNKNOWN',
    verificationResult: 'UNVERIFIABLE',
    verifiedAt: NOW(),
    reason,
    provider,
    signatureChecked: false,
  };
}

/**
 * How a cryptographic verdict maps onto a campus outcome.
 *
 * EXPIRED and REVOKED stay distinct from INVALID on purpose: an expired card
 * sends a student to the registry, a tampered one sends them to security.
 */
const STATE_MAP: Record<VerificationState, { outcome: VerificationOutcome; status: CredentialStatus }> = {
  VALID: { outcome: 'VALID', status: 'VALID' },
  EXPIRED: { outcome: 'EXPIRED', status: 'EXPIRED' },
  REVOKED: { outcome: 'REVOKED', status: 'REVOKED' },
  SUSPENDED: { outcome: 'REVOKED', status: 'REVOKED' },
  INVALID_SIGNATURE: { outcome: 'INVALID', status: 'UNKNOWN' },
  UNKNOWN_ISSUER: { outcome: 'INVALID', status: 'UNKNOWN' },
  KEY_REVOKED: { outcome: 'INVALID', status: 'UNKNOWN' },
  MALFORMED: { outcome: 'INVALID', status: 'UNKNOWN' },
  UNSUPPORTED_PROFILE: { outcome: 'INVALID', status: 'UNKNOWN' },
  WRONG_ISSUER: { outcome: 'INVALID', status: 'UNKNOWN' },
};

const STATE_REASONS: Record<VerificationState, string> = {
  VALID: 'Signature verified against a published university key.',
  EXPIRED: 'The signature is genuine, but the card is past its expiry date.',
  REVOKED: 'The university has blocked this credential.',
  SUSPENDED: 'This credential is suspended pending review.',
  INVALID_SIGNATURE: 'The signature does not match. These bytes were not written by the university.',
  UNKNOWN_ISSUER: 'Signed by a key this university does not publish.',
  KEY_REVOKED: 'The key that signed this card has been withdrawn.',
  MALFORMED: 'This is not a university credential.',
  UNSUPPORTED_PROFILE: 'This card uses a newer credential format than this build understands.',
  WRONG_ISSUER: 'This card was issued by a different institution.',
};

type HolderRow = {
  person_id: string;
  credential_id: string;
  full_name: string | null;
  student_id: string | null;
  department: string | null;
  person_status: string;
  credential_state: string;
  reason_code: string | null;
  expires_at: string | null;
};

/**
 * Who a verified credential belongs to.
 *
 * Reached through a SECURITY DEFINER function because a guard holds no read
 * on people or credentials, and should not. The function answers only for a
 * credential id the caller already has, and only within their own university.
 */
async function resolveHolder(jti: string): Promise<HolderRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('resolve_credential_holder', { p_jti: jti });

  if (!error) {
    const rows = (data ?? []) as HolderRow[];
    return rows[0] ?? null;
  }

  // The function arrives with migration 0107. Until it is applied, a role that
  // holds a read on credentials can still answer the same question directly.
  const direct = await supabase
    .from('credentials')
    .select(
      `id, expires_at,
       people ( id, full_name, student_id, department, status ),
       credential_status ( status, reason_code )`,
    )
    .eq('jti', jti)
    .maybeSingle();

  if (direct.error || !direct.data) return null;

  const row = direct.data as unknown as {
    id: string;
    expires_at: string | null;
    people: {
      id: string;
      full_name: string | null;
      student_id: string | null;
      department: string | null;
      status: string;
    } | null;
    credential_status: { status: string; reason_code: string | null } | null;
  };

  if (!row.people) return null;

  return {
    person_id: row.people.id,
    credential_id: row.id,
    full_name: row.people.full_name,
    student_id: row.people.student_id,
    department: row.people.department,
    person_status: row.people.status,
    credential_state: row.credential_status?.status ?? 'unknown',
    reason_code: row.credential_status?.reason_code ?? null,
    expires_at: row.expires_at,
  };
}

/**
 * Revocation, read live at the point of scan.
 *
 * The card itself cannot know it has been blocked, so this is the one lookup
 * a connected gate performs. When it fails, the credential is still reported
 * VALID with the failure named in the reason, because a network problem is not
 * evidence against a student.
 */
async function lookupStatus(claims: CompactCredential): Promise<StatusReading> {
  const checkedAt = new Date();
  const holder = await resolveHolder(claims.jti);

  if (!holder) return { status: 'unknown', checkedAt, source: 'cache' };

  const state = holder.credential_state;
  if (state === 'revoked' || state === 'superseded' || state === 'expired') {
    return { status: 'revoked', checkedAt, source: 'online' };
  }
  if (state === 'suspended') return { status: 'suspended', checkedAt, source: 'online' };
  if (state === 'active') return { status: 'active', checkedAt, source: 'online' };
  return { status: 'unknown', checkedAt, source: 'cache' };
}

/** The real thing: a signed credential read from a QR code. */
async function verifySignedCard(payload: string, issuerCode?: string): Promise<VerificationResult> {
  const provider = 'ed25519-credential';

  let compactJws: string;
  try {
    compactJws = readScannedPayload(payload);
  } catch (error) {
    if (error instanceof QrPayloadError) {
      return {
        verified: false,
        personId: null,
        credentialId: null,
        status: 'UNKNOWN',
        verificationResult: 'INVALID',
        verifiedAt: NOW(),
        reason: error.message,
        provider,
        signatureChecked: false,
      };
    }
    throw error;
  }

  // A key set that cannot be read is our failure, not the student's. It comes
  // back UNVERIFIABLE, which records nothing, rather than as a rejection.
  let resolver;
  try {
    resolver = await issuerKeyResolver();
  } catch (error) {
    return unverifiable(
      error instanceof Error ? error.message : 'The signing keys are unavailable.',
      provider,
    );
  }

  const result = await verifySignedCredential(compactJws, {
    resolver,
    expectedIssuer: issuerCode,
    lookupStatus,
  });

  const mapped = STATE_MAP[result.state];
  const verifiedAt = result.checkedAt.toISOString();

  // Claims exist only when the signature verified, so a name can never be
  // rendered from an unverified card.
  const holder = result.claims ? await resolveHolder(result.claims.jti) : null;

  return {
    verified: result.ok,
    personId: holder?.person_id ?? null,
    credentialId: holder?.credential_id ?? null,
    status: mapped.status,
    verificationResult: mapped.outcome,
    verifiedAt,
    reason: result.reason ?? STATE_REASONS[result.state],
    provider,
    // The signature was actually checked for every state except the ones that
    // never reached the check.
    signatureChecked: !['MALFORMED', 'UNKNOWN_ISSUER', 'KEY_REVOKED'].includes(result.state),
    subjectName: result.claims?.nm ?? null,
    subjectCode: result.claims?.sn ?? null,
  };
}

/**
 * Fallback for a card whose printed number was typed in by hand.
 *
 * It proves the number is on the register. It proves nothing about the card,
 * because no signature was involved, and every result it produces says so.
 */
async function verifyPrintedNumber(code: string): Promise<VerificationResult> {
  const provider = 'printed-number';
  const verifiedAt = NOW();

  const base = {
    personId: null,
    credentialId: null,
    provider,
    signatureChecked: false,
    verifiedAt,
  };

  if (!/^[A-Za-z0-9-]{4,32}$/.test(code)) {
    return {
      ...base,
      verified: false,
      status: 'UNKNOWN' as const,
      verificationResult: 'INVALID' as const,
      reason: 'That is not a readable student number.',
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('resolve_person_by_code', { p_code: code });

  if (error) return unverifiable(`The register could not be read: ${error.message}`, provider);

  const person = ((data ?? []) as Array<{
    person_id: string;
    full_name: string | null;
    student_id: string | null;
    person_status: string;
  }>)[0];

  if (!person) {
    return {
      ...base,
      verified: false,
      status: 'UNKNOWN' as const,
      verificationResult: 'INVALID' as const,
      reason: 'No student on this campus holds that number.',
    };
  }

  if (person.person_status !== 'active') {
    return {
      ...base,
      personId: person.person_id,
      verified: false,
      status: 'REVOKED' as const,
      verificationResult: 'REVOKED' as const,
      reason: 'This student record is no longer active.',
      subjectName: person.full_name,
      subjectCode: person.student_id,
    };
  }

  return {
    ...base,
    personId: person.person_id,
    verified: true,
    status: 'VALID' as const,
    verificationResult: 'VALID' as const,
    reason: 'Found on the register. No card signature was checked.',
    subjectName: person.full_name,
    subjectCode: person.student_id,
  };
}

/** True when a scan looks like a compact JWS rather than a typed number. */
function looksLikeCredential(payload: string): boolean {
  return payload.trim().split('.').length === 3;
}

/**
 * Verifies whatever the reader produced.
 *
 * @param payload a QR string, or a student number typed by hand.
 * @param issuerCode refuse credentials from any other institution.
 */
export async function verifyCredential(
  payload: string,
  issuerCode?: string,
): Promise<VerificationResult> {
  const trimmed = payload.trim();

  if (looksLikeCredential(trimmed)) return verifySignedCard(trimmed, issuerCode);

  if (allowsPrintedNumbers()) return verifyPrintedNumber(trimmed);

  return {
    verified: false,
    personId: null,
    credentialId: null,
    status: 'UNKNOWN',
    verificationResult: 'INVALID',
    verifiedAt: NOW(),
    reason: 'Scan the QR code on the card. A typed number is not accepted here.',
    provider: 'ed25519-credential',
    signatureChecked: false,
  };
}

/**
 * Whether a typed student number is accepted as well as a scanned card.
 *
 * On by default for the demo, because not every laptop has a camera. Turning
 * it off makes the signature the only way in.
 */
export function allowsPrintedNumbers(): boolean {
  return process.env.ALLOW_PRINTED_NUMBER_SCAN !== 'false';
}
