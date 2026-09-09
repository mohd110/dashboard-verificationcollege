import type { ReactNode } from 'react';

import { signOut } from '@/app/login/actions';
import type { StaffSession } from '@/lib/session';
import { ROLE_LABELS } from '@/lib/types';

export function TopBar({ session, nav }: { session: StaffSession; nav?: ReactNode }) {
  const posting = session.posting ? ` · ${session.posting.name}` : '';

  return (
    <header className="bg-brand text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 pt-4 pb-3">
        <div>
          <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-white/60 uppercase">
            Smart Identity
          </p>
          <p className="text-sm font-semibold">{session.universityName}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium">{session.fullName}</p>
            <p className="text-xs text-white/70">
              {ROLE_LABELS[session.role]}
              {posting}
            </p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded border border-white/30 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {nav ? <div className="mx-auto max-w-7xl px-6">{nav}</div> : null}
    </header>
  );
}
