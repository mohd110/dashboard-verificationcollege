import type { ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { ADMIN_LINKS } from '@/components/shell/sidebar';
import { requireAdminSession } from '@/lib/session';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession();

  return (
    <AppShell session={session} links={ADMIN_LINKS} subtitle="Administration">
      {children}
    </AppShell>
  );
}
