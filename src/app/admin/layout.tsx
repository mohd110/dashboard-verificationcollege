import type { ReactNode } from 'react';

import { AdminNav } from '@/components/admin-nav';
import { TopBar } from '@/components/top-bar';
import { requireAdminSession } from '@/lib/session';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession();

  return (
    <div className="min-h-screen">
      <TopBar session={session} nav={<AdminNav />} />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
