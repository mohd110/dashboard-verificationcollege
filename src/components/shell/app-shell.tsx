import type { ReactNode } from 'react';

import type { StaffSession } from '@/lib/session';
import { ROLE_LABELS } from '@/lib/types';

import { Sidebar, type NavSet } from './sidebar';

/**
 * The frame every signed-in screen sits in.
 *
 * The sidebar and the header are rendered by the layout and never re-render on
 * a navigation, so moving between screens repaints only the panel in the
 * middle. That, plus a loading skeleton on every route, is what stops a tab
 * change from looking like a page load.
 *
 * `nav` names a set of links rather than carrying one. Everything that crosses
 * from here into the sidebar has to survive serialisation, and an icon is a
 * function, so the links themselves stay on the client side of the boundary.
 */
export function AppShell({
  session,
  nav,
  subtitle,
  children,
}: {
  session: StaffSession;
  nav: NavSet;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Sidebar
        nav={nav}
        subtitle={subtitle}
        userName={session.fullName}
        userRole={ROLE_LABELS[session.role]}
        posting={session.posting?.name ?? null}
      />

      <div className="lg:pl-[244px]">
        <header className="sticky top-0 z-40 flex h-[60px] items-center justify-between gap-4 border-b border-line bg-surface/95 px-6 backdrop-blur-sm max-lg:pl-16">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{session.universityName}</p>
            <p className="truncate text-xs text-faint">
              {session.posting
                ? `${ROLE_LABELS[session.role]} · ${session.posting.name}`
                : ROLE_LABELS[session.role]}
            </p>
          </div>

          <p className="hidden shrink-0 text-xs text-faint sm:block">
            Demo environment · fabricated records
          </p>
        </header>

        <main className="mx-auto max-w-[1280px] px-6 py-7">{children}</main>
      </div>
    </div>
  );
}
