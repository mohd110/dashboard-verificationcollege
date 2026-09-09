/**
 * What goes into the QR code, and what comes out of a scan.
 *
 * The answer is: the compact JWS, and nothing else. No URL wrapper, no prefix,
 * no envelope.
 *
 * A URL would be smaller to look at and much worse: it invites the scanner to
 * follow a link chosen by whoever printed the card, which is exactly how a
 * forger gets a guard to see a green tick from their own look-alike site. The
 * verifier here never follows anything it scans — it checks a signature
 * against keys it already holds.
 *
 * Pure. No key material, no network.
 */

import { MAX_ENCODED_CHARS } from '@/lib/credential/profile';

/** QR byte-mode capacity at error-correction level M, by version. */
export const QR_CAPACITY_ECC_M: ReadonlyArray<{ version: number; bytes: number; modules: number }> = [
  { version: 10, bytes: 213, modules: 57 },
  { version: 12, bytes: 287, modules: 65 },
  { version: 14, bytes: 362, modules: 73 },
  { version: 15, bytes: 412, modules: 77 },
  { version: 16, bytes: 450, modules: 81 },
  { version: 17, bytes: 504, modules: 85 },
  { version: 20, bytes: 666, modules: 97 },
];

export interface QrPlan {
  payload: string;
  length: number;
  version: number;
  modules: number;
  /** Module size in millimetres if printed at the given width. */
  moduleMillimetres: number;
  withinBudget: boolean;
}

export class QrPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrPayloadError';
  }
}

/**
 * Works out which QR version a credential needs, and how small each module
 * will be once printed.
 *
 * Module size is the number that actually decides whether a guard's phone can
 * read the card in a badly lit corridor. Below roughly 0.30 mm a mid-range
 * camera starts to struggle at arm's length.
 */
export function planQr(compactJws: string, printedWidthMm = 30): QrPlan {
  if (!compactJws || typeof compactJws !== 'string') {
    throw new QrPayloadError('nothing to encode');
  }

  const length = compactJws.length;
  const fit = QR_CAPACITY_ECC_M.find((candidate) => length <= candidate.bytes);

  if (!fit) {
    throw new QrPayloadError(
      `credential is ${length} characters — beyond the largest version this card can carry`,
    );
  }

  // Four modules of quiet zone on each side, as the QR spec requires.
  const modulesWithQuietZone = fit.modules + 8;

  return {
    payload: compactJws,
    length,
    version: fit.version,
    modules: fit.modules,
    moduleMillimetres: Number((printedWidthMm / modulesWithQuietZone).toFixed(3)),
    withinBudget: length <= MAX_ENCODED_CHARS,
  };
}

/**
 * Normalises whatever a scanner hands us.
 *
 * Scanners return odd things: leading whitespace, a trailing newline, an
 * `http://` prefix a helpful library added. This strips the noise and refuses
 * anything that is not shaped like a compact JWS — before any of it reaches
 * the verifier.
 */
export function readScannedPayload(raw: string): string {
  if (typeof raw !== 'string') throw new QrPayloadError('scan produced no text');

  const trimmed = raw.trim().replace(/\s+/g, '');
  if (trimmed.length === 0) throw new QrPayloadError('scan was empty');

  // Bound the work before pattern-matching hostile input.
  if (trimmed.length > MAX_ENCODED_CHARS * 2) {
    throw new QrPayloadError('scanned data is far too long to be a card');
  }

  // A QR containing a URL is not one of our cards. Say so plainly rather than
  // trying to be helpful and following it.
  if (/^[a-z]+:\/\//i.test(trimmed)) {
    throw new QrPayloadError('this QR code contains a web link, not a university credential');
  }

  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(trimmed)) {
    throw new QrPayloadError('this QR code is not a university credential');
  }

  return trimmed;
}
