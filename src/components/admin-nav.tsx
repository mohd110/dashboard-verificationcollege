'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/students', label: 'Students' },
  { href: '/admin/verifications', label: 'Verification History' },
  { href: '/admin/activity', label: 'Activity Trail' },
  { href: '/admin/locations', label: 'Locations' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/integrity', label: 'Integrity' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {LINKS.map((link) => {
        const active = link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              active
                ? 'border-accent text-white'
                : 'border-transparent text-white/70 hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
