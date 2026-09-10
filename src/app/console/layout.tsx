import type { ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { requireStaffSession } from '@/lib/session';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await requireStaffSession();

  return (
    <AppShell session={session} nav="console" subtitle="Verification Console">
      {children}
    </AppShell>
  );
}
