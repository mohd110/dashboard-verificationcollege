import { describe, expect, it } from 'vitest';

import { buildCredential, endOfAcademicYear, fitDisplayName } from '../credential/builder';
import {
  checkBudget,
  decodeUnverified,
  fromBase64Url,
  serialiseClaims,
  toBase64Url,
} from '../credential/codec';
import {
  CLAIM_ORDER,
  CredentialProfileError,
  MAX_ENCODED_CHARS,
  MAX_NAME_CHARS,
  assertValidProfile,
  type CompactCredential,
} from '../credential/profile';
import { planQr, QrPayloadError, readScannedPayload } from '../qr/payload';

/**
 * The credential profile is shared with the verification dashboard, which
 * writes to the same credentials table. These tests exist to catch the two
 * ways that sharing can quietly break: a claim that stops encoding
 * deterministically, and a credential that grows past what a QR code on a
 * printed card can hold.
 */

const SIXTEEN = new Uint8Array(16).fill(7);

function claims(overrides: Partial<CompactCredential> = {}): CompactCredential {
  return buildCredential(
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
      statusListIndex: 12,
      issuedAt: new Date('2026-09-08T10:00:00Z'),
      expiresAt: new Date('2027-09-08T10:00:00Z'),
      ...overrides,
    } as Parameters<typeof buildCredential>[1],
  );
}

describe('claim encoding', () => {
  it('serialises in the declared order, not insertion order', () => {
    const built = claims();

    // Rebuilt with the keys shuffled. Both must encode to the same bytes, or a
    // credential could not be re-derived from the database and compared with a
    // card during an investigation.
    const shuffled = Object.fromEntries(
      [...CLAIM_ORDER].reverse().map((key) => [key, built[key]]),
    ) as unknown as CompactCredential;

    expect(serialiseClaims(shuffled)).toBe(serialiseClaims(built));
  });

  it('round-trips base64url without padding', () => {
    const encoded = toBase64Url(SIXTEEN);
    expect(encoded).not.toContain('=');
    expect([...fromBase64Url(encoded)]).toEqual([...SIXTEEN]);
  });
});

describe('profile validation', () => {
  it('accepts a credential built by the builder', () => {
    expect(() => assertValidProfile(claims())).not.toThrow();
  });

  it('refuses a claim that would put personal data on a public QR code', () => {
    const leaky = { ...claims(), email: 'rahul@example.test' } as unknown as CompactCredential;
    expect(() => assertValidProfile(leaky)).toThrow(CredentialProfileError);
  });

  it('refuses an expiry that is not after issuance', () => {
    expect(() =>
      claims({
        issuedAt: new Date('2026-09-08T10:00:00Z'),
        expiresAt: new Date('2026-09-08T10:00:00Z'),
      } as Partial<CompactCredential>),
    ).toThrow();
  });
});

describe('display names', () => {
  it('leaves a name that fits alone', () => {
    expect(fitDisplayName('Rahul', 'Kumar')).toBe('Rahul Kumar');
  });

  it('shortens the given name before cutting the family name', () => {
    const fitted = fitDisplayName('Konstantinos', 'Papadopoulos-Nakamura');
    expect(fitted.startsWith('K. ')).toBe(true);
    expect(fitted.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
  });

  it('never exceeds the card, whatever it is given', () => {
    const fitted = fitDisplayName('A'.repeat(40), 'B'.repeat(40));
    expect(fitted.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
  });
});

describe('size budget', () => {
  it('keeps a realistic credential inside a printable QR code', () => {
    const budget = checkBudget(claims(), 'EdDSA', 'nort-2026-09-ab12');
    expect(budget.withinBudget).toBe(true);
    expect(budget.length).toBeLessThanOrEqual(MAX_ENCODED_CHARS);
  });

  it('plans a QR version whose modules are still readable at 30 mm', () => {
    const plan = planQr('a'.repeat(400));
    expect(plan.withinBudget).toBe(true);
    // Below roughly 0.30 mm a mid-range phone camera starts to struggle.
    expect(plan.moduleMillimetres).toBeGreaterThan(0.29);
  });

  it('refuses to plan something no card can carry', () => {
    expect(() => planQr('a'.repeat(2000))).toThrow(QrPayloadError);
  });
});

describe('reading a scan', () => {
  it('strips the noise a reader adds', () => {
    expect(readScannedPayload('  aaa.bbb.ccc \n')).toBe('aaa.bbb.ccc');
  });

  it('refuses a QR code containing a web link rather than following it', () => {
    expect(() => readScannedPayload('https://not-the-university.example/card')).toThrow(
      QrPayloadError,
    );
  });

  it('refuses anything not shaped like a compact JWS', () => {
    expect(() => readScannedPayload('NU20260042')).toThrow(QrPayloadError);
  });
});

describe('decodeUnverified', () => {
  it('reads the header without pretending to have verified anything', () => {
    const header = toBase64Url(
      new TextEncoder().encode(JSON.stringify({ alg: 'EdDSA', kid: 'k1', typ: 'vc+jwt' })),
    );
    const payload = toBase64Url(new TextEncoder().encode(serialiseClaims(claims())));
    const decoded = decodeUnverified(`${header}.${payload}.${toBase64Url(SIXTEEN)}`);

    expect(decoded.header.kid).toBe('k1');
    expect(decoded.claims.sn).toBe('NU20260042');
  });

  it('rejects anything that is not three parts', () => {
    expect(() => decodeUnverified('one.two')).toThrow(CredentialProfileError);
  });
});

describe('endOfAcademicYear', () => {
  it('adds the requested number of months', () => {
    const from = new Date('2026-09-08T10:00:00Z');
    expect(endOfAcademicYear(from, 12).toISOString()).toBe('2027-09-08T10:00:00.000Z');
  });
});
