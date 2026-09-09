import type { ReactNode } from 'react';

import { TopBar } from '@/components/top-bar';
import { requireStaffSession } from '@/lib/session';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await requireStaffSession();

  return (
    <div className="min-h-screen">
      <TopBar session={session} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
