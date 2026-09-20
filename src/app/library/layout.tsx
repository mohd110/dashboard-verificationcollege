import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import LibrarySidebar from '@/components/library/LibrarySidebar';
import { getLibrarianContext, LibrarianAuthError } from '@/lib/auth/librarian';
import { getStaffSession, homePathFor } from '@/lib/session';
import { ROLE_LABELS } from '@/lib/types';

export const metadata = { title: 'Library · GBPUAT Smart Identity' };

/**
 * The library panel.
 *
 * Everything inside sits in .lib-scope, which is what confines the library's
 * design system to these screens. See src/app/lib-scope.css.
 *
 * A member of staff who may not work the issue desk is sent to their own
 * home rather than signed out. Signing them out would be a strange thing to do
 * to a guard who followed a stale link, and the middleware would only bounce
 * them back here.
 */
export default async function LibraryLayout({ children }: { children: ReactNode }) {
  const session = await getStaffSession();
  if (!session) redirect('/login?next=/library');

  let librarian;
  try {
    librarian = await getLibrarianContext();
  } catch (error) {
    if (error instanceof LibrarianAuthError) {
      redirect(error.status === 'UNAUTHORIZED' ? '/login?next=/library' : homePathFor(session));
    }
    throw error;
  }

  return (
    <div className="lib-scope">
      <div className="lib-shell">
        <LibrarySidebar
          userName={librarian.name}
          userRole={ROLE_LABELS[session.role]}
          locationName={librarian.locationName}
        />
        <main className="lib-main">{children}</main>
      </div>
    </div>
  );
}
