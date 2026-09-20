import type { ReactNode } from 'react';

export const metadata = {
  title: 'Gate Verifier · GBPUAT Smart Identity',
  description: 'Campus gate identity verification.',
};

/**
 * The gate application's frame.
 *
 * Deliberately not the AppShell. This screen is worked one-handed on a phone
 * at a gate, and it carries its own header and bottom navigation, so a
 * sidebar built for a desk would only be in the way.
 */
export default function GuardLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8f9ff',
        color: '#0f1c2c',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {children}
    </div>
  );
}
