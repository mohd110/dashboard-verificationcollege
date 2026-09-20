/**
 * The shape of one scan result, and the value the panel starts on.
 *
 * This lives outside scan.ts on purpose. A 'use server' module may only export
 * async functions: the client build replaces it with a table of action
 * references, and any plain value exported alongside them arrives as
 * undefined. The panel reads state.outcome on its very first render, so an
 * undefined initial state throws before anything is on screen.
 */

import type { CredentialStatus } from '@/lib/verification/contract';

export type ScanOutcome = 'idle' | 'accepted' | 'rejected' | 'blocked';

export type ScannedStudent = {
  id: string;
  student_id: string | null;
  full_name: string | null;
  email: string | null;
  department: string | null;
  status: string;
};

export type ScanState = {
  outcome: ScanOutcome;
  /** The verdict in a few words. Never a clean pass for an unsigned lookup. */
  headline: string;
  detail: string;
  /** True only when a digital signature was actually checked and passed. */
  signatureChecked: boolean;
  credentialStatus: CredentialStatus;
  student: ScannedStudent | null;
  /** Position in the campus hash chain, when the scan was recorded. */
  chainPosition: number | null;
  /** Changes on every scan, so the panel flashes even on an identical result. */
  scanId: number;
};

export const idleScan: ScanState = {
  outcome: 'idle',
  headline: '',
  detail: '',
  signatureChecked: false,
  credentialStatus: 'UNKNOWN',
  student: null,
  chainPosition: null,
  scanId: 0,
};
