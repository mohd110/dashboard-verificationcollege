'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BadgeCheck,
  BookMarked,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  ScanLine,
  ShieldCheck,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';

import { signOut } from '@/app/login/actions';

export type NavLink = { href: string; label: string; icon: LucideIcon };

export const ADMIN_LINKS: NavLink[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/students', label: 'Students', icon: Users },
  { href: '/admin/cards', label: 'Cards', icon: BadgeCheck },
  { href: '/admin/verifications', label: 'Verification History', icon: ScanLine },
  { href: '/admin/activity', label: 'Activity Trail', icon: Activity },
  { href: '/admin/locations', label: 'Locations', icon: MapPin },
  { href: '/admin/users', label: 'Users', icon: UsersRound },
  { href: '/admin/integrity', label: 'Integrity', icon: ShieldCheck },
];

export const CONSOLE_LINKS: NavLink[] = [
  { href: '/console', label: 'Scan', icon: ScanLine },
];

function isActive(pathname: string, href: string, roots: string[]): boolean {
  // A root link matches only itself, or every deeper page would light it up too.
  if (roots.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  links,
  subtitle,
  userName,
  userRole,
  posting,
}: {
  links: NavLink[];
  subtitle: string;
  userName: string;
  userRole: string;
  posting: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // A navigation on a phone has to close the drawer it was made from.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const roots = links.map((link) => link.href).filter((href) => href.split('/').length === 2);
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="fixed top-3 left-3 z-60 rounded-lg bg-brand p-2 text-white shadow-raised lg:hidden"
      >
        <Menu size={18} />
      </button>

      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-ink/40 lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-60 flex w-[244px] flex-col bg-brand transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-start gap-2.5 border-b border-white/10 px-5 py-4">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <BookMarked size={17} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-semibold tracking-wider text-white/50 uppercase">
              Smart Identity
            </p>
            <p className="truncate text-[0.8125rem] font-semibold text-white">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="text-white/60 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <p className="px-5 pt-2 pb-1 text-[0.625rem] font-bold tracking-widest text-white/35 uppercase">
            Navigation
          </p>

          {links.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href, roots);

            return (
              <Link
                key={href}
                href={href}
                prefetch
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 border-l-[3px] px-[17px] py-2.5 text-[0.8125rem] font-medium transition-colors ${
                  active
                    ? 'border-brand-bright bg-white/12 text-white'
                    : 'border-transparent text-white/65 hover:bg-white/8 hover:text-white'
                }`}
              >
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-white/8">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
              {initials || '—'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8125rem] font-semibold text-white">{userName}</p>
              <p className="truncate text-[0.6875rem] text-white/50">
                {userRole}
                {posting ? ` · ${posting}` : ''}
              </p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="flex items-center p-1 text-white/50 transition-colors hover:text-white"
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
