'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, BookOpen, BookPlus, CornerDownLeft, ScanLine,
  ArrowLeftRight, Bell, LogOut, BookMarked, Menu, X,
} from 'lucide-react';
import { signOut } from '@/app/login/actions';

const navItems = [
  { href: '/library',              icon: LayoutDashboard,  label: 'Dashboard' },
  { href: '/library/verify',       icon: ScanLine,         label: 'Verify Identity' },
  { href: '/library/students',     icon: Users,            label: 'Students' },
  { href: '/library/books',        icon: BookOpen,         label: 'Books' },
  { href: '/library/issue',        icon: BookPlus,         label: 'Issue Book' },
  { href: '/library/return',       icon: CornerDownLeft,   label: 'Return Book' },
  { href: '/library/transactions', icon: ArrowLeftRight,   label: 'Transactions' },
  { href: '/library/notifications',icon: Bell,             label: 'Notifications' },
];

interface LibrarySidebarProps {
  userName: string;
  userRole: string;
  locationName: string;
}

export default function LibrarySidebar({ userName, userRole, locationName }: LibrarySidebarProps) {
  const pathname = usePathname();

  /**
   * The drawer, on a phone.
   *
   * The stylesheet has always slid .lib-sidebar off screen below 900px and
   * expected a .lib-sidebar--open to bring it back, but nothing ever added
   * that class and there was no button to add it with. On a phone the library
   * panel therefore rendered with no navigation at all: the dashboard was
   * visible and every other screen was unreachable.
   */
  const [open, setOpen] = useState(false);

  // A navigation on a phone has to close the drawer it was made from.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === '/library') return pathname === '/library';
    return pathname.startsWith(href);
  };

  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="lib-nav-toggle"
      >
        <Menu size={18} />
      </button>

      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="lib-nav-scrim"
        />
      ) : null}

    <aside className={`lib-sidebar${open ? ' lib-sidebar--open' : ''}`}>
      {/* Brand */}
      <div className="lib-sidebar__brand">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BookMarked size={17} color="#ffffff" />
          </div>
          <div>
            <p className="lib-sidebar__brand-title" style={{ marginBottom: 0 }}>University Smart Identity</p>
            <p className="lib-sidebar__brand-sub">Library Management</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="lib-nav-close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="lib-sidebar__nav">
        <p className="lib-sidebar__section-label">Navigation</p>
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`lib-sidebar__link ${isActive(href) ? 'lib-sidebar__link--active' : ''}`}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="lib-sidebar__footer">
        <div className="lib-sidebar__user">
          <div className="lib-sidebar__avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="lib-sidebar__user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userName}
            </p>
            <p className="lib-sidebar__user-role">{userRole} · {locationName}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center' }}
            >
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </div>
    </aside>
    </>
  );
}
