import { describe, expect, it } from 'vitest';

import { isRecordable, outcomeToEventResult, type VerificationResult } from '../verification/contract';

function result(overrides: Partial<VerificationResult>): VerificationResult {
  return {
    verified: false,
    personId: null,
    credentialId: null,
    status: 'UNKNOWN',
    verificationResult: 'INVALID',
    verifiedAt: '2026-09-08T05:02:00Z',
    reason: 'test',
    provider: 'test',
    signatureChecked: true,
    ...overrides,
  };
}

describe('outcomeToEventResult', () => {
  it('carries a revocation through to the recorded event', () => {
    expect(outcomeToEventResult('REVOKED')).toBe('REVOKED');
    expect(outcomeToEventResult('EXPIRED')).toBe('EXPIRED');
  });

  it('maps a good check to VALID', () => {
    expect(outcomeToEventResult('VALID')).toBe('VALID');
  });

  it('treats anything else as a plain rejection', () => {
    expect(outcomeToEventResult('INVALID')).toBe('INVALID');
    expect(outcomeToEventResult('UNVERIFIABLE')).toBe('INVALID');
  });
});

describe('isRecordable', () => {
  it('records a decision, good or bad', () => {
    expect(isRecordable(result({ verificationResult: 'VALID', verified: true }))).toBe(true);
    expect(isRecordable(result({ verificationResult: 'REVOKED' }))).toBe(true);
  });

  it('records nothing when no check could be made', () => {
    // A student must never be marked rejected because our own service was down.
    expect(isRecordable(result({ verificationResult: 'UNVERIFIABLE' }))).toBe(false);
  });
});
