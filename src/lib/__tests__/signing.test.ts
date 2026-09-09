import { describe, expect, it } from 'vitest';

import { buildCredential } from '../credential/builder';
import { serialiseClaims } from '../credential/codec';
import { EnvKeySigner, generateDemoKeyPair, publicJwkFromPrivate } from '../crypto/env-signer';
import { StaticKeyResolver, verifyCredential } from '../crypto/verify';
import type { PublicKeyRecord } from '../crypto/signer';

/**
 * Sign here, verify here.
 *
 * This is the loop the demo depends on: a card issued by this dashboard has to
 * verify at this dashboard's own console, and a card that has been tampered
 * with has to fail. Everything is done with a throwaway key, so no test touches
 * the key in the environment.
 */

const SIXTEEN = new Uint8Array(16).fill(3);
const NOW = new Date('2026-09-08T10:00:00Z');

async function issuedCard(overrides: { expiresAt?: Date } = {}) {
  const pair = await generateDemoKeyPair('test-key-1');
  const signer = new EnvKeySigner({ kid: pair.kid, privateJwk: pair.privateJwk });

  const claims = buildCredential(
    {
      studentNumber: 'NU20260042',
      givenName: 'Rahul',
      familyName: 'Kumar',
      departmentCode: 'CS',
      role: 's',
      cardSequence: 1,
    },
    {
      issuerCode: 'nort',
      credentialId: SIXTEEN,
      photoHash: SIXTEEN,
      statusListIndex: 0,
      issuedAt: NOW,
      expiresAt: overrides.expiresAt ?? new Date('2027-09-08T10:00:00Z'),
    },
  );

  const compactJws = await signer.signCompact(
    new TextEncoder().encode(serialiseClaims(claims)),
  );

  const key: PublicKeyRecord = {
    kid: pair.kid,
    alg: 'EdDSA',
    publicJwk: pair.publicJwk as JsonWebKey,
    status: 'active',
    notBefore: new Date(0).toISOString(),
  };

  return { compactJws, key, claims };
}

describe('a card this dashboard issued', () => {
  it('verifies against the published key', async () => {
    const { compactJws, key } = await issuedCard();

    const result = await verifyCredential(compactJws, {
      resolver: new StaticKeyResolver([key]),
      now: NOW,
    });

    expect(result.state).toBe('VALID');
    expect(result.ok).toBe(true);
    expect(result.claims?.sn).toBe('NU20260042');
  });

  it('fails once a single character is altered', async () => {
    const { compactJws, key } = await issuedCard();

    // Flip a character in the payload, leaving the shape intact.
    const [header, payload, signature] = compactJws.split('.');
    const tampered = `${header}.${payload.slice(0, -1)}${payload.at(-1) === 'A' ? 'B' : 'A'}.${signature}`;

    const result = await verifyCredential(tampered, {
      resolver: new StaticKeyResolver([key]),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(result.claims).toBeUndefined();
  });

  it('refuses a key the university does not publish', async () => {
    const { compactJws } = await issuedCard();

    const result = await verifyCredential(compactJws, {
      resolver: new StaticKeyResolver([]),
      now: NOW,
    });

    expect(result.state).toBe('UNKNOWN_ISSUER');
  });

  it('refuses every credential under a withdrawn key', async () => {
    const { compactJws, key } = await issuedCard();

    const result = await verifyCredential(compactJws, {
      resolver: new StaticKeyResolver([{ ...key, status: 'compromised' }]),
      now: NOW,
    });

    expect(result.state).toBe('KEY_REVOKED');
  });

  it('reports expiry separately from tampering', async () => {
    const { compactJws, key } = await issuedCard({
      expiresAt: new Date('2026-09-09T10:00:00Z'),
    });

    const result = await verifyCredential(compactJws, {
      resolver: new StaticKeyResolver([key]),
      now: new Date('2026-10-01T10:00:00Z'),
    });

    // An expired card sends a student to the registry. A tampered one sends
    // them to security. The two must never collapse into one answer.
    expect(result.state).toBe('EXPIRED');
    expect(result.claims).toBeDefined();
  });

  it('stops a blocked card even though the signature is perfect', async () => {
    const { compactJws, key } = await issuedCard();

    const result = await verifyCredential(compactJws, {
      resolver: new StaticKeyResolver([key]),
      now: NOW,
      lookupStatus: async () => ({
        status: 'revoked',
        checkedAt: NOW,
        source: 'online',
      }),
    });

    expect(result.state).toBe('REVOKED');
    expect(result.ok).toBe(false);
  });

  it('refuses a card from another institution', async () => {
    const { compactJws, key } = await issuedCard();

    const result = await verifyCredential(compactJws, {
      resolver: new StaticKeyResolver([key]),
      expectedIssuer: 'sout',
      now: NOW,
    });

    expect(result.state).toBe('WRONG_ISSUER');
  });
});

describe('key handling', () => {
  it('never lets the private half into a published key', async () => {
    const pair = await generateDemoKeyPair('test-key-2');
    const published = publicJwkFromPrivate(pair.privateJwk);

    expect('d' in pair.privateJwk).toBe(true);
    expect('d' in published).toBe(false);
  });

  it('refuses to build a signer from a public key', async () => {
    const pair = await generateDemoKeyPair('test-key-3');
    expect(() => new EnvKeySigner({ kid: pair.kid, privateJwk: pair.publicJwk })).toThrow();
  });
});
