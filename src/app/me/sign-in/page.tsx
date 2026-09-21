import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

import { readStudentSession } from '@/lib/student/session';

import { CardSignIn } from './card-sign-in';

export const metadata = { title: 'Student Pass · GBPUAT Smart Identity' };

export default async function StudentSignInPage() {
  // Already carrying a pass: no reason to make anybody scan twice.
  if (await readStudentSession()) redirect('/me');

  return (
    <div className="pass-scope">
      <div className="pass-signin">
        <div className="pass-signin__card">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div
              className="pass-crest"
              style={{ width: 48, height: 48, flex: '0 0 48px', margin: '0 auto 14px' }}
            >
              <ShieldCheck size={24} color="#ffffff" />
            </div>
            <p
              style={{
                margin: '0 0 4px',
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--p-ink-faint)',
              }}
            >
              Pantnagar · Uttarakhand
            </p>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Student Pass
            </h1>
            <p style={{ margin: '7px 0 0', fontSize: 12.5, lineHeight: 1.55, color: 'var(--p-ink-soft)' }}>
              Your card is your login. Scan it, then confirm your date of birth.
            </p>
          </div>

          <CardSignIn />

          <p className="pass-note">
            There is no password. The university signed your card, so checking that signature
            proves who you are. Your date of birth is asked for because it is deliberately not
            written into the QR code — which means a photograph of your card is not enough to open
            your pass.
          </p>

          <p className="pass-note" style={{ marginTop: 10 }}>
            Staff sign in on the{' '}
            <a href="/login" style={{ color: 'var(--p-brand)' }}>
              main screen
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
