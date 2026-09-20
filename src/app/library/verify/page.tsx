import { ScanLine, ShieldCheck } from 'lucide-react';

import CardScanner from '@/components/library/CardScanner';
import { getLibrarianContext } from '@/lib/auth/librarian';
import { allowsPrintedNumbers } from '@/lib/verification/verify';

/**
 * The identity desk.
 *
 * A card check on its own, for a student who is entering the library rather
 * than borrowing. Every scan is recorded as IDENTITY_VERIFIED or
 * IDENTITY_REJECTED against the campus hash chain, whether or not a book
 * follows.
 */
export default async function VerifyPage() {
  const librarian = await getLibrarianContext();
  const printedNumbers = allowsPrintedNumbers();

  return (
    <div className="lib-content">
      <div className="lib-page-header">
        <h1 className="lib-page-title">Verify Identity</h1>
        <p className="lib-page-sub">
          Scan a student card at {librarian.locationName}. The signature is checked against the
          university&rsquo;s published keys, so no network call decides the answer.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 20, alignItems: 'start' }}>
        <div className="card">
          <div className="card-header"><h3 className="card-title">Card Reader</h3></div>
          <div className="card-body">
            <CardScanner
              allowPrintedNumber={printedNumbers}
              locationName={librarian.locationName}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">What a result means</h3></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
            <div>
              <p style={{ margin: '0 0 3px', fontWeight: 700, color: 'var(--success)' }}>VALID</p>
              <p style={{ margin: 0, color: 'var(--gray-500)' }}>
                The signature is genuine and the card is in date and not blocked.
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 3px', fontWeight: 700, color: 'var(--warning)' }}>EXPIRED</p>
              <p style={{ margin: 0, color: 'var(--gray-500)' }}>
                The signature is genuine, the card is out of date. Send the student to the registry
                office. This is paperwork, not a security matter.
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 3px', fontWeight: 700, color: 'var(--danger)' }}>REVOKED</p>
              <p style={{ margin: 0, color: 'var(--gray-500)' }}>
                The signature is genuine and the university has blocked the card. Refuse the issue.
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 3px', fontWeight: 700, color: 'var(--danger)' }}>INVALID</p>
              <p style={{ margin: 0, color: 'var(--gray-500)' }}>
                The bytes were altered, or signed by somebody without the private key. A tampered
                card is a security matter.
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: 12, display: 'flex', gap: 8 }}>
              <ShieldCheck size={15} color="var(--brand-600)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, color: 'var(--gray-500)' }}>
                Cards signed by the rotated key <code>nf-2026-01</code> still verify. A rotated key
                stays published; only a revoked or compromised one is refused.
              </p>
            </div>
            {printedNumbers && (
              <div style={{ display: 'flex', gap: 8 }}>
                <ScanLine size={15} color="var(--gray-400)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, color: 'var(--gray-500)' }}>
                  A typed student number is accepted as a fallback. It never shows a green tick,
                  and the event records <code>signature_checked: false</code>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
