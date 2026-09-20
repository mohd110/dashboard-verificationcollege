import { ShieldCheck } from 'lucide-react';

import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · GBPUAT Smart Identity' };

/**
 * One sign-in for every panel.
 *
 * There is deliberately no role picker. The account already carries its role,
 * and asking somebody to choose one would either be ignored or be a way to ask
 * for permissions they do not have. Where each role lands afterwards is
 * decided by homePathFor() in lib/session.
 */

const NOTICES: Record<string, string> = {
  not_library_staff: 'This account does not have library staff access.',
  deactivated: 'This account has been deactivated. Speak to an administrator.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="lib-scope">
      <div className="login-page">
        <div className="login-card">
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '14px',
                background: 'var(--brand-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
              }}
            >
              <ShieldCheck size={26} color="#ffffff" />
            </div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--gray-400)',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                margin: '0 0 4px',
              }}
            >
              Pantnagar · Uttarakhand
            </p>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>
              University Smart Identity
            </h1>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '6px 0 0' }}>
              Sign in with your university staff account
            </p>
          </div>

          <LoginForm next={next} notice={error ? NOTICES[error] : undefined} />

          <div className="divider" />
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--gray-400)', margin: 0 }}>
            Govind Ballabh Pant University of Agriculture &amp; Technology
            <br />
            Demo environment · all student records are fabricated
          </p>
        </div>

        <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
