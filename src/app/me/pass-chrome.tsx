import type { ReactNode } from 'react';
import Link from 'next/link';
import { Activity, BookMarked, IdCard, LogOut, PartyPopper, ShieldCheck } from 'lucide-react';

import { minutesLeft, type StudentSession } from '@/lib/student/session';

import { signOutStudent } from './actions';

/**
 * The frame every pass screen sits in: a wordmark, the time left on the pass,
 * and the four places a student can go.
 */

const TABS = [
  { href: '/me', label: 'My Pass', icon: IdCard },
  { href: '/me/library', label: 'Library', icon: BookMarked },
  { href: '/me/events', label: 'Events', icon: PartyPopper },
  { href: '/me/activity', label: 'Activity', icon: Activity },
] as const;

export function PassChrome({
  session,
  active,
  children,
}: {
  session: StudentSession;
  active: (typeof TABS)[number]['href'];
  children: ReactNode;
}) {
  const left = minutesLeft(session);

  return (
    <div className="pass-scope">
      <div className="pass-shell">
        <header className="pass-topbar">
          <div className="pass-wordmark">
            <div className="pass-crest">
              <ShieldCheck size={17} color="#ffffff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <p className="pass-wordmark__title">Student Pass</p>
              <p className="pass-wordmark__sub">
                {/* A pass that is about to lapse should say so before it does. */}
                {left > 0 ? `Open for ${left} min` : 'Expiring now'}
              </p>
            </div>
          </div>

          <form action={signOutStudent}>
            <button
              type="submit"
              className="pass-btn pass-btn--quiet"
              style={{ width: 'auto', padding: '8px 12px', fontSize: 12 }}
            >
              <LogOut size={14} />
              Close
            </button>
          </form>
        </header>

        {children}
      </div>

      <nav className="pass-nav">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={active === href ? 'page' : undefined}
            className={`pass-nav__link${active === href ? ' pass-nav__link--active' : ''}`}
          >
            <Icon size={19} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
