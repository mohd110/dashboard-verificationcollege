/**
 * The demo signer: an Ed25519 private key held in an environment variable.
 *
 * PROTOTYPE ONLY.
 *
 * An environment variable is readable by anyone with dashboard access and is
 * decrypted into function memory on every invocation. That is acceptable for a
 * demonstration signing credentials for a hundred invented students, and
 * unacceptable the moment a real student is issued a card — because whoever
 * holds this key can mint unlimited perfect university IDs.
 *
 * The replacement is a KMS implementing the same `CredentialSigner` interface,
 * where the key never leaves the service and we call Sign() instead. Nothing
 * outside this file changes when that happens. See docs/PLANNING.md §5.
 */

import { importJWK, exportJWK, generateKeyPair, CompactSign } from 'jose';
import type { CredentialSigner, PublicKeyRecord, SigningAlgorithm } from './signer';

export const DEMO_KEY_WARNING =
  'DEMO KEY — environment variable, not a hardware vault. Never issue real student cards with this.';

/**
 * Derives the public half of a JWK by allowlisting the public members.
 *
 * Deliberately an allowlist rather than `delete jwk.d`. A denylist has to
 * anticipate every private field — RSA alone has `d`, `p`, `q`, `dp`, `dq`,
 * `qi` — and anything missed would be published to the world in a JWKS
 * endpoint. Copying only what is known to be public cannot leak by omission.
 *
 * (This also sidesteps a jose detail: a key from `importJWK` is not
 * extractable, so it cannot be exported back to a JWK.)
 */
export function publicJwkFromPrivate(privateJwk: Record<string, unknown>): JsonWebKey {
  const PUBLIC_MEMBERS = ['kty', 'crv', 'x', 'y', 'n', 'e', 'alg', 'use', 'key_ops'] as const;
  const publicJwk: Record<string, unknown> = {};
  for (const member of PUBLIC_MEMBERS) {
    if (privateJwk[member] !== undefined) publicJwk[member] = privateJwk[member];
  }
  return publicJwk as JsonWebKey;
}

export interface EnvKeyConfig {
  kid: string;
  /** The private key as a JWK. For Ed25519 this carries `d`; guard it. */
  privateJwk: Record<string, unknown>;
  alg?: SigningAlgorithm;
}

export class EnvKeySigner implements CredentialSigner {
  readonly kid: string;
  readonly alg: SigningAlgorithm;
  readonly #privateJwk: Record<string, unknown>;

  constructor(config: EnvKeyConfig) {
    if (!config.kid) throw new Error('EnvKeySigner requires a kid');
    if (!config.privateJwk || typeof config.privateJwk !== 'object') {
      throw new Error('EnvKeySigner requires a private JWK');
    }
    if (!('d' in config.privateJwk)) {
      throw new Error('EnvKeySigner was given a public key — it cannot sign with that');
    }
    this.kid = config.kid;
    this.alg = config.alg ?? 'EdDSA';
    this.#privateJwk = config.privateJwk;
  }

  /** Reads the key from the environment. Server-side callers only. */
  static fromEnv(env: Record<string, string | undefined> = process.env): EnvKeySigner {
    const kid = env.DEMO_SIGNING_KEY_KID;
    const raw = env.DEMO_SIGNING_KEY_PRIVATE_JWK;
    if (!kid || !raw) {
      throw new Error(
        'DEMO_SIGNING_KEY_KID and DEMO_SIGNING_KEY_PRIVATE_JWK must be set. ' +
          'Run: npm run key:generate',
      );
    }
    let privateJwk: Record<string, unknown>;
    try {
      privateJwk = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error('DEMO_SIGNING_KEY_PRIVATE_JWK is not valid JSON');
    }
    return new EnvKeySigner({ kid, privateJwk });
  }

  async sign(payload: Uint8Array): Promise<Uint8Array> {
    const key = await importJWK(this.#privateJwk, this.alg);
    const jws = await new CompactSign(payload)
      .setProtectedHeader({ alg: this.alg, kid: this.kid, typ: 'vc+jwt' })
      .sign(key);
    const signature = jws.split('.')[2];
    if (!signature) throw new Error('signing produced no signature');
    const binary = atob(signature.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /**
   * Signs a credential payload and returns the compact JWS that goes on a card.
   *
   * Uses jose to build the whole thing rather than assembling it ourselves —
   * the header and payload must be encoded exactly as the signature covers
   * them, and hand-rolling that is a classic source of verification bugs.
   */
  async signCompact(payload: Uint8Array): Promise<string> {
    const key = await importJWK(this.#privateJwk, this.alg);
    return new CompactSign(payload)
      .setProtectedHeader({ alg: this.alg, kid: this.kid, typ: 'vc+jwt' })
      .sign(key);
  }

  async publicKey(): Promise<PublicKeyRecord> {
    return {
      kid: this.kid,
      alg: this.alg,
      publicJwk: publicJwkFromPrivate(this.#privateJwk),
      status: 'active',
      notBefore: new Date(0).toISOString(),
    };
  }
}

/** Generates a fresh Ed25519 keypair. Used by the key generation script. */
export async function generateDemoKeyPair(kid: string): Promise<{
  kid: string;
  alg: SigningAlgorithm;
  privateJwk: Record<string, unknown>;
  publicJwk: Record<string, unknown>;
}> {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
    crv: 'Ed25519',
    extractable: true,
  });
  const privateJwk = (await exportJWK(privateKey)) as Record<string, unknown>;
  const publicJwk = (await exportJWK(publicKey)) as Record<string, unknown>;
  delete publicJwk.d;
  return { kid, alg: 'EdDSA', privateJwk, publicJwk };
}
