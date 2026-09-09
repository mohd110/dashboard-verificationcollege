/**
 * Credential verification.
 *
 * This is the security boundary of the entire system. Everything above the
 * signature check is hostile input; everything below it is proven to have been
 * written by the university.
 *
 * Pure and framework-free by design: it runs unchanged on a server and inside
 * a guard's phone with no network. If verification ever required a round trip,
 * offline gates would stop working and the architecture would collapse into a
 * centralised lookup service.
 *
 * Rules this file enforces, each of which is a documented way JWT
 * verification is got wrong:
 *
 *   1. The algorithm is checked against an ALLOWLIST, never taken from the
 *      token. `alg: none` and HMAC-with-the-public-key both die here.
 *   2. The `kid` must resolve to a key we already hold. A token cannot
 *      nominate its own key.
 *   3. A key whose status is revoked or compromised is refused outright.
 *   4. Claims are not parsed into application state, returned, or rendered
 *      until the signature has verified.
 */

import { compactVerify, importJWK } from 'jose';
import { decodeUnverified } from '@/lib/credential/codec';
import {
  assertValidProfile,
  PROFILE_VERSION,
  MAX_ENCODED_CHARS,
  type CompactCredential,
} from '@/lib/credential/profile';
import type { IssuerKeyResolver, PublicKeyRecord } from './signer';

/** Algorithms we accept. Anything else is refused, including `none`. */
export const ALLOWED_ALGORITHMS = ['EdDSA', 'ES256'] as const;
export type AllowedAlgorithm = (typeof ALLOWED_ALGORITHMS)[number];

export type VerificationState =
  /** Signature good, issuer known, in date. Status is reported separately. */
  | 'VALID'
  /** Signature good, but past its expiry — a renewal problem, not a security one. */
  | 'EXPIRED'
  /** Signature good, but the university has cancelled it. */
  | 'REVOKED'
  | 'SUSPENDED'
  /** The bytes were altered, or signed by someone without the private key. */
  | 'INVALID_SIGNATURE'
  /** The signing key is not one we know. */
  | 'UNKNOWN_ISSUER'
  /** The key is known and has been withdrawn — every credential under it fails. */
  | 'KEY_REVOKED'
  /** Not a credential at all: wrong shape, wrong encoding, hostile input. */
  | 'MALFORMED'
  /** A newer profile version than this build understands. */
  | 'UNSUPPORTED_PROFILE'
  /** Signature good, but issued by a different institution than expected. */
  | 'WRONG_ISSUER';

export interface StatusReading {
  status: 'active' | 'suspended' | 'revoked' | 'unknown';
  /** When the status information was obtained. Older than the app's limit → not trusted. */
  checkedAt: Date;
  source: 'online' | 'cache';
}

export interface VerificationResult {
  state: VerificationState;
  /** True only for VALID. Everything else stops the holder at the gate. */
  ok: boolean;
  /**
   * Present ONLY when the signature verified.
   *
   * This is the structural expression of "verify before you read": callers
   * cannot render a name from an unverified credential, because there is no
   * name to render.
   */
  claims?: CompactCredential;
  /** Which key signed it, when that could be determined. */
  keyId?: string;
  /** Human-readable detail. Safe to log; contains no personal data. */
  reason?: string;
  /** Status information, when a lookup was supplied. */
  status?: StatusReading;
  checkedAt: Date;
}

export interface VerifyOptions {
  resolver: IssuerKeyResolver;
  /** Refuse credentials from any other issuer. Omit to accept any known key. */
  expectedIssuer?: string;
  /** Supplied by the app; injectable so tests are not at the mercy of the clock. */
  now?: Date;
  /** Tolerance for clock drift between the issuing server and the phone. */
  clockSkewSeconds?: number;
  /** Phase 6 supplies the status list here. Absent → status is not reported. */
  lookupStatus?: (claims: CompactCredential) => Promise<StatusReading>;
}

const fail = (
  state: VerificationState,
  reason: string,
  checkedAt: Date,
  keyId?: string,
): VerificationResult => ({ state, ok: false, reason, checkedAt, keyId });

/**
 * Verifies a compact credential read from a QR code.
 *
 * Never throws on bad input — hostile bytes are an expected condition at a
 * gate, not an exception. Everything comes back as a state the UI can show.
 */
export async function verifyCredential(
  compactJws: string,
  options: VerifyOptions,
): Promise<VerificationResult> {
  const checkedAt = options.now ?? new Date();
  const skew = options.clockSkewSeconds ?? 60;

  // 1. Bounds and shape, before anything expensive touches the input.
  if (typeof compactJws !== 'string' || compactJws.length === 0) {
    return fail('MALFORMED', 'empty input', checkedAt);
  }
  if (compactJws.length > MAX_ENCODED_CHARS * 2) {
    return fail('MALFORMED', 'implausibly long for a credential', checkedAt);
  }

  let header: { alg?: string; kid?: string; typ?: string };
  try {
    ({ header } = decodeUnverified(compactJws));
  } catch (error) {
    return fail('MALFORMED', (error as Error).message, checkedAt);
  }

  // 2. Algorithm allowlist. Taking `alg` from the token and trusting it is the
  //    single most exploited flaw in JWT deployments.
  if (!header.alg || !(ALLOWED_ALGORITHMS as readonly string[]).includes(header.alg)) {
    return fail('INVALID_SIGNATURE', `algorithm "${header.alg ?? 'absent'}" is not accepted`, checkedAt);
  }
  if (!header.kid) {
    return fail('UNKNOWN_ISSUER', 'no key id in header', checkedAt);
  }

  // 3. The key must be one we already hold. A credential cannot nominate its
  //    own verification key.
  let key: PublicKeyRecord | null;
  try {
    key = await options.resolver.resolve(header.kid);
  } catch (error) {
    return fail('UNKNOWN_ISSUER', `key lookup failed: ${(error as Error).message}`, checkedAt, header.kid);
  }
  if (!key) {
    return fail('UNKNOWN_ISSUER', 'signed by a key this university does not publish', checkedAt, header.kid);
  }
  if (key.alg !== header.alg) {
    return fail('INVALID_SIGNATURE', 'algorithm does not match the registered key', checkedAt, key.kid);
  }
  if (key.status === 'revoked' || key.status === 'compromised') {
    return fail(
      'KEY_REVOKED',
      `signing key was withdrawn (${key.status})`,
      checkedAt,
      key.kid,
    );
  }

  // 4. THE SIGNATURE. Everything after this line is trusted data.
  let payloadBytes: Uint8Array;
  try {
    const publicKey = await importJWK(key.publicJwk as Record<string, unknown>, key.alg);
    const result = await compactVerify(compactJws, publicKey, {
      // Belt and braces: jose enforces the allowlist too, so even a mistake
      // in step 2 cannot let an unexpected algorithm through.
      algorithms: [key.alg],
    });
    payloadBytes = result.payload;
  } catch (error) {
    return fail(
      'INVALID_SIGNATURE',
      `signature did not verify: ${(error as Error).message}`,
      checkedAt,
      key.kid,
    );
  }

  // 5. Shape of the payload. A good signature proves the issuer wrote these
  //    bytes — not that they are shaped the way this build expects.
  let claims: CompactCredential;
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes)) as CompactCredential;
  } catch {
    return fail('MALFORMED', 'signed payload is not valid JSON', checkedAt, key.kid);
  }
  if (typeof claims?.v !== 'number') {
    return fail('MALFORMED', 'signed payload has no profile version', checkedAt, key.kid);
  }
  if (claims.v !== PROFILE_VERSION) {
    return fail(
      'UNSUPPORTED_PROFILE',
      `credential uses profile v${claims.v}; this app understands v${PROFILE_VERSION}`,
      checkedAt,
      key.kid,
    );
  }
  try {
    assertValidProfile(claims);
  } catch (error) {
    return fail('MALFORMED', (error as Error).message, checkedAt, key.kid);
  }

  // 6. Is it from the institution we are checking for?
  if (options.expectedIssuer && claims.iss !== options.expectedIssuer) {
    return {
      state: 'WRONG_ISSUER',
      ok: false,
      reason: `issued by "${claims.iss}", expected "${options.expectedIssuer}"`,
      keyId: key.kid,
      checkedAt,
    };
  }

  const nowSeconds = Math.floor(checkedAt.getTime() / 1000);

  if (claims.iat - skew > nowSeconds) {
    return fail('MALFORMED', 'issued in the future', checkedAt, key.kid);
  }

  // 7. Expiry. A distinct state on purpose: an expired card sends a student to
  //    the registry office, a tampered one sends them to security.
  if (nowSeconds > claims.exp + skew) {
    return { state: 'EXPIRED', ok: false, claims, keyId: key.kid, checkedAt };
  }

  // 8. Revocation, when the caller supplied a way to look it up.
  if (options.lookupStatus) {
    let status: StatusReading;
    try {
      status = await options.lookupStatus(claims);
    } catch (error) {
      status = { status: 'unknown', checkedAt, source: 'cache' };
      return {
        state: 'VALID',
        ok: true,
        claims,
        keyId: key.kid,
        checkedAt,
        status,
        reason: `status could not be checked: ${(error as Error).message}`,
      };
    }
    if (status.status === 'revoked') {
      return { state: 'REVOKED', ok: false, claims, keyId: key.kid, checkedAt, status };
    }
    if (status.status === 'suspended') {
      return { state: 'SUSPENDED', ok: false, claims, keyId: key.kid, checkedAt, status };
    }
    return { state: 'VALID', ok: true, claims, keyId: key.kid, checkedAt, status };
  }

  return { state: 'VALID', ok: true, claims, keyId: key.kid, checkedAt };
}

/**
 * A resolver over a fixed set of keys.
 *
 * This is what the verifier app uses: it syncs the university's published keys
 * on startup and holds them, so a scan needs no network at all.
 */
export class StaticKeyResolver implements IssuerKeyResolver {
  readonly #keys: Map<string, PublicKeyRecord>;

  constructor(keys: PublicKeyRecord[]) {
    this.#keys = new Map(keys.map((k) => [k.kid, k]));
  }

  async resolve(kid: string): Promise<PublicKeyRecord | null> {
    return this.#keys.get(kid) ?? null;
  }

  async all(): Promise<PublicKeyRecord[]> {
    return [...this.#keys.values()];
  }
}
