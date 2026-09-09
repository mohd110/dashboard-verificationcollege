/**
 * The signing seam.
 *
 * This interface is the single place the rest of the system talks to a private
 * key. Nothing else in the codebase may touch key material — and because every
 * caller depends only on this shape, moving from a demo key in an environment
 * variable to a cloud KMS to a dedicated signing service is a dependency swap,
 * not a rewrite.
 *
 *   Local dev / MVP demo   EnvKeySigner        key in .env.local, fake data only
 *   Pilot                  KmsSigner           key never leaves the KMS
 *   Production             RemoteSignerClient  KMS behind its own service
 *
 * Implementations arrive in Phase 4. This file deliberately contains no
 * cryptography yet — only the contract everything else is written against.
 */

/**
 * Signature algorithms we are prepared to accept.
 *
 * Ed25519 is the default: its 64-byte signatures are what keep a credential
 * inside the QR size budget. ES256 exists because not every KMS and HSM
 * supports Ed25519, and that constraint may be settled by the tender rather
 * than by us. The algorithm travels with each credential, so both can coexist
 * during a migration.
 */
export type SigningAlgorithm = 'EdDSA' | 'ES256';

/** Lifecycle of a published issuer key. Old public keys are never deleted. */
export type KeyStatus =
  | 'active' // currently used for new credentials
  | 'rotated' // superseded, but its credentials remain valid
  | 'revoked' // withdrawn; verifiers must reject its signatures
  | 'compromised'; // revoked because the private key may be in hostile hands

export interface PublicKeyRecord {
  /** Stable key identifier carried in every credential this key signs. */
  kid: string;
  alg: SigningAlgorithm;
  /** Public key in JWK form, as published at /.well-known/jwks.json */
  publicJwk: JsonWebKey;
  status: KeyStatus;
  notBefore: string;
  notAfter?: string;
  revokedAt?: string;
}

/**
 * Produces signatures. Implementations must never expose, return, or log the
 * private key, and must never accept one as a method argument.
 */
export interface CredentialSigner {
  readonly kid: string;
  readonly alg: SigningAlgorithm;

  /** Sign raw bytes. Callers pass the JWS signing input, never a JSON object. */
  sign(payload: Uint8Array): Promise<Uint8Array>;

  /** The matching public key, for publication and for local verification. */
  publicKey(): Promise<PublicKeyRecord>;
}

/**
 * Resolves a key id to a public key, for verification.
 *
 * Verification is separated from signing on purpose: the verifier app needs
 * this half and must never be able to link against the other. A verifier that
 * cannot resolve a `kid`, or that resolves one whose status is `revoked` or
 * `compromised`, must reject the credential rather than fall back to anything.
 */
export interface IssuerKeyResolver {
  resolve(kid: string): Promise<PublicKeyRecord | null>;
  /** Every key an issuer has ever published, for offline caching. */
  all(): Promise<PublicKeyRecord[]>;
}
