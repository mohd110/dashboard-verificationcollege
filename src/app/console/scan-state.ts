/**
 * The shape of one scan result, and the value the panel starts on.
 *
 * This lives outside actions.ts on purpose. A 'use server' module may only
 * export async functions: the client build replaces it with a table of action
 * references, and any plain value exported alongside them arrives as undefined.
 * The panel reads `state.outcome` on its very first render, so an undefined
 * initial state throws before anything is on screen.
 */

export type ScanOutcome = 'idle' | 'accepted' | 'rejected' | 'blocked';

export type ScanState = {
  outcome: ScanOutcome;
  headline: string;
  detail: string;
  studentName: string | null;
  studentCode: string | null;
  chainPosition: number | null;
  /** True when the decision was made without checking a signature. */
  provisional: boolean;
  /** Changes on every scan, so the panel can flash even on an identical result. */
  scanId: number;
};

export const idleScan: ScanState = {
  outcome: 'idle',
  headline: '',
  detail: '',
  studentName: null,
  studentCode: null,
  chainPosition: null,
  provisional: false,
  scanId: 0,
};
