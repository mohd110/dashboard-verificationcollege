import type { ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { requireAdminSession } from '@/lib/session';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession();

  return (
    <AppShell session={session} nav="admin" subtitle="Administration">
      {children}
    </AppShell>
  );
}
