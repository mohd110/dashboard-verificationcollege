/**
 * Deterministic encoding of the compact credential.
 *
 * Determinism is a requirement, not a nicety: during an investigation we must
 * be able to rebuild a credential from the database and compare it byte for
 * byte with the one on a card. Anything that varies between runs — key order,
 * whitespace, number formatting — makes that impossible.
 *
 * Pure. No key material, no network. Runs identically in Node and in a browser.
 */

import {
  CLAIM_ORDER,
  MAX_ENCODED_CHARS,
  assertValidProfile,
  CredentialProfileError,
  type CompactCredential,
} from './profile';

/** base64url, no padding — RFC 4648 §5, as used throughout JOSE. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Serialises claims with keys in the profile's declared order.
 *
 * `JSON.stringify` follows insertion order, which depends on how the object
 * happened to be built. Ordering explicitly removes that dependency.
 */
export function serialiseClaims(claims: CompactCredential): string {
  const ordered: Record<string, unknown> = {};
  for (const key of CLAIM_ORDER) {
    const value = claims[key];
    if (value !== undefined) ordered[key] = value;
  }
  return JSON.stringify(ordered);
}

/** The signing input: `base64url(header) + "." + base64url(payload)`. */
export function signingInput(headerB64: string, payloadB64: string): Uint8Array {
  return encoder.encode(`${headerB64}.${payloadB64}`);
}

export interface JwsHeader {
  alg: string;
  kid: string;
  typ: string;
}

/** Header as fixed by VC-JOSE-COSE. `typ` marks this as a verifiable credential. */
export function buildHeader(alg: string, kid: string): JwsHeader {
  return { alg, kid, typ: 'vc+jwt' };
}

export function encodeHeader(header: JwsHeader): string {
  return toBase64Url(encoder.encode(JSON.stringify({ alg: header.alg, kid: header.kid, typ: header.typ })));
}

export function encodePayload(claims: CompactCredential): string {
  assertValidProfile(claims);
  return toBase64Url(encoder.encode(serialiseClaims(claims)));
}

/**
 * Predicts the encoded length before a signature exists.
 *
 * Used at issuance time so an over-budget credential is caught when it is
 * built, rather than when someone tries to print it.
 *
 * @param signatureBytes 64 for both Ed25519 and ECDSA P-256.
 */
export function predictEncodedLength(
  claims: CompactCredential,
  alg: string,
  kid: string,
  signatureBytes = 64,
): number {
  const header = encodeHeader(buildHeader(alg, kid));
  const payload = encodePayload(claims);
  const signature = Math.ceil((signatureBytes * 4) / 3);
  return header.length + 1 + payload.length + 1 + signature;
}

export interface BudgetReport {
  length: number;
  limit: number;
  withinBudget: boolean;
  headroom: number;
}

export function checkBudget(
  claims: CompactCredential,
  alg: string,
  kid: string,
  signatureBytes = 64,
): BudgetReport {
  const length = predictEncodedLength(claims, alg, kid, signatureBytes);
  return {
    length,
    limit: MAX_ENCODED_CHARS,
    withinBudget: length <= MAX_ENCODED_CHARS,
    headroom: MAX_ENCODED_CHARS - length,
  };
}

/**
 * Splits a compact JWS into its three parts without verifying anything.
 *
 * Deliberately named so no caller mistakes it for verification. The header may
 * be inspected to find the `kid`; **the payload must not be trusted, parsed
 * into application state, or rendered until a signature check has passed.**
 * Verification arrives in Phase 4.
 */
export function decodeUnverified(compactJws: string): {
  header: JwsHeader;
  payloadB64: string;
  signatureB64: string;
  claims: CompactCredential;
} {
  if (compactJws.length > MAX_ENCODED_CHARS * 2) {
    // Bound the work before touching hostile input.
    throw new CredentialProfileError('credential is implausibly long; refusing to parse');
  }

  const parts = compactJws.split('.');
  if (parts.length !== 3) {
    throw new CredentialProfileError('not a compact JWS: expected three dot-separated parts');
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new CredentialProfileError('not a compact JWS: an empty part');
  }

  let header: JwsHeader;
  try {
    header = JSON.parse(decoder.decode(fromBase64Url(headerB64))) as JwsHeader;
  } catch {
    throw new CredentialProfileError('header is not valid JSON');
  }

  let claims: CompactCredential;
  try {
    claims = JSON.parse(decoder.decode(fromBase64Url(payloadB64))) as CompactCredential;
  } catch {
    throw new CredentialProfileError('payload is not valid JSON');
  }

  return { header, payloadB64, signatureB64, claims };
}

/** Round-trips claims through encoding, for tests and for forensic comparison. */
export function decodeClaims(payloadB64: string): CompactCredential {
  return JSON.parse(decoder.decode(fromBase64Url(payloadB64))) as CompactCredential;
}
