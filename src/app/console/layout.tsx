import type { ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { CONSOLE_LINKS } from '@/components/shell/sidebar';
import { requireStaffSession } from '@/lib/session';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await requireStaffSession();

  return (
    <AppShell session={session} links={CONSOLE_LINKS} subtitle="Verification Console">
      {children}
    </AppShell>
  );
}
