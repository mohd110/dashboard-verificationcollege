import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { VerificationResult } from './contract';

/**
 * Providers that turn a scanned payload into a verification result.
 *
 * Point VERIFICATION_PROVIDER at a new case here when the credential
 * subsystem lands. Nothing else in the application needs to change.
 */

function unverifiable(reason: string, provider: string): VerificationResult {
  return {
    verified: false,
    personId: null,
    credentialId: null,
    status: 'UNKNOWN',
    verificationResult: 'UNVERIFIABLE',
    verifiedAt: new Date().toISOString(),
    reason,
    provider,
    signatureChecked: false,
  };
}

/**
 * Stand-in used while the credential subsystem is being built.
 *
 * It looks a student up by the code printed on their card and reports whether
 * that student is on the register. It checks no signature, so it proves the
 * number exists, not that the card is genuine. Every result it produces says
 * so, and every event recorded from it carries signature_checked: false.
 *
 * Refuses to run outside development.
 */
async function verifyAgainstRegistry(payload: string): Promise<VerificationResult> {
  const provider = 'demo-registry';

  if (process.env.NODE_ENV === 'production') {
    return unverifiable(
      'The demo registry provider is disabled outside development.',
      provider,
    );
  }

  const code = payload.trim();
  if (!/^[A-Za-z0-9-]{4,32}$/.test(code)) {
    return {
      verified: false,
      personId: null,
      credentialId: null,
      status: 'UNKNOWN',
      verificationResult: 'INVALID',
      verifiedAt: new Date().toISOString(),
      reason: 'That is not a readable student code.',
      provider,
      signatureChecked: false,
    };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('people')
    .select('id, status')
    .eq('student_id', code)
    .maybeSingle();

  const verifiedAt = new Date().toISOString();

  if (!data) {
    return {
      verified: false,
      personId: null,
      credentialId: null,
      status: 'UNKNOWN',
      verificationResult: 'INVALID',
      verifiedAt,
      reason: 'No student on this campus holds that code.',
      provider,
      signatureChecked: false,
    };
  }

  if (data.status !== 'active') {
    return {
      verified: false,
      personId: data.id,
      credentialId: null,
      status: 'REVOKED',
      verificationResult: 'REVOKED',
      verifiedAt,
      reason: 'This student record is no longer active.',
      provider,
      signatureChecked: false,
    };
  }

  return {
    verified: true,
    personId: data.id,
    credentialId: null,
    status: 'VALID',
    verificationResult: 'VALID',
    verifiedAt,
    reason: 'Student found on the register. No signature was checked.',
    provider,
    signatureChecked: false,
  };
}

/**
 * Verifies a scanned credential.
 *
 * @param payload whatever the reader produced: a QR string, or the student
 *   code typed by hand.
 */
export async function verifyCredential(payload: string): Promise<VerificationResult> {
  const provider = process.env.VERIFICATION_PROVIDER ?? 'none';

  switch (provider) {
    case 'demo-registry':
      return verifyAgainstRegistry(payload);
    case 'none':
      return unverifiable(
        'The credential verification service is not connected yet.',
        provider,
      );
    default:
      return unverifiable(`Unknown verification provider "${provider}".`, provider);
  }
}

/** True when scans are being decided without any cryptographic check. */
export function isUsingStandInProvider(): boolean {
  return (process.env.VERIFICATION_PROVIDER ?? 'none') === 'demo-registry';
}
