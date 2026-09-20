import type { ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { capabilitiesFor, requireRecordsSession } from '@/lib/records/access';

/**
 * The records office.
 *
 * One panel shared by the registrar, the card operator, the revocation officer
 * and the auditor, because they work on the same register and differ only in
 * what they may do to it. The sidebar shows each of them the screens their
 * role can actually use — see lib/records/access.ts.
 */
export default async function RecordsLayout({ children }: { children: ReactNode }) {
  const session = await requireRecordsSession();

  return (
    <AppShell
      session={session}
      nav="records"
      subtitle="Records Office"
      capabilities={capabilitiesFor(session)}
    >
      {children}
    </AppShell>
  );
}
