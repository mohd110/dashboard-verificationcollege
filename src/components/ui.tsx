import type { ReactNode } from 'react';

import type { CampusEventResult } from '@/lib/types';
import { FAILED_RESULTS } from '@/lib/types';

/* ── Surfaces ─────────────────────────────────────────────────────────── */

export function Card({
  title,
  description,
  action,
  padded = false,
  children,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  /** Adds the standard inset. Leave off for a card that holds a table. */
  padded?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface shadow-card">
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-faint">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {padded ? <div className="px-5 py-5">{children}</div> : children}
    </section>
  );
}

export function EmptyState({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="px-5 py-14 text-center">
      {title ? <p className="text-sm font-medium text-ink-soft">{title}</p> : null}
      <p className={`text-sm text-muted ${title ? 'mt-1' : ''}`}>{children}</p>
    </div>
  );
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ── Figures ──────────────────────────────────────────────────────────── */

const TILE_TONES = {
  blue: 'bg-brand-light text-brand-mid',
  green: 'bg-ok-light text-ok',
  amber: 'bg-warn-light text-warn',
  red: 'bg-bad-light text-bad',
  grey: 'bg-line-soft text-muted',
} as const;

export type TileTone = keyof typeof TILE_TONES;

export function StatTile({
  label,
  value,
  note,
  icon,
  tone = 'blue',
}: {
  label: string;
  value: number | string;
  note?: string;
  icon?: ReactNode;
  tone?: TileTone;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4 shadow-card transition-shadow hover:shadow-raised">
      {icon ? (
        <div
          className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${TILE_TONES[tone]}`}
        >
          {icon}
        </div>
      ) : null}
      <p className="text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      {note ? <p className="mt-1 text-xs text-faint">{note}</p> : null}
    </div>
  );
}

/* ── Status ───────────────────────────────────────────────────────────── */

const BADGE_TONES = {
  good: 'bg-ok-light text-ok ring-ok-line',
  bad: 'bg-bad-light text-bad ring-bad-line',
  warn: 'bg-warn-light text-warn ring-warn-line',
  info: 'bg-brand-light text-brand-mid ring-brand-line',
  quiet: 'bg-line-soft text-muted ring-line',
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({ tone = 'quiet', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap ring-1 ring-inset ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function ResultBadge({ result }: { result: CampusEventResult }) {
  return <Badge tone={FAILED_RESULTS.includes(result) ? 'bad' : 'good'}>{result}</Badge>;
}

export function StatusPill({ active }: { active: boolean }) {
  return <Badge tone={active ? 'good' : 'quiet'}>{active ? 'Active' : 'Inactive'}</Badge>;
}

/** Credential and card lifecycle states, which are not all good or all bad. */
const LIFECYCLE_TONES: Record<string, BadgeTone> = {
  active: 'good',
  issued: 'good',
  collected: 'good',
  printed: 'info',
  requested: 'quiet',
  returned: 'quiet',
  suspended: 'warn',
  revoked: 'bad',
  destroyed: 'bad',
  superseded: 'quiet',
  expired: 'warn',
  unknown: 'quiet',
};

export function LifecycleBadge({ state }: { state: string }) {
  return <Badge tone={LIFECYCLE_TONES[state] ?? 'quiet'}>{state.toUpperCase()}</Badge>;
}

export function Hash({ children }: { children: ReactNode }) {
  return <code className="font-mono text-xs break-all text-muted">{children}</code>;
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'bad' | 'ok';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: 'border-brand-line bg-brand-light text-brand-dark',
    ok: 'border-ok-line bg-ok-light text-ok',
    warn: 'border-warn-line bg-warn-light text-warn',
    bad: 'border-bad-line bg-bad-light text-bad',
  } as const;

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1 opacity-90' : ''}>{children}</div>
    </div>
  );
}

/* ── Tables ───────────────────────────────────────────────────────────── */

export function DataTable({
  head,
  children,
  /** Drops the minimum width, for tables that sit in a narrow column. */
  compact = false,
}: {
  head: ReactNode[];
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-sm ${compact ? '' : 'min-w-[44rem]'}`}>
        <thead>
          <tr className="border-b border-line bg-canvas text-left">
            {head.map((cell, index) => (
              <th
                key={index}
                className="px-5 py-2.5 text-[0.6875rem] font-semibold tracking-wide text-muted uppercase whitespace-nowrap"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">{children}</tbody>
      </table>
    </div>
  );
}

/** A table row that leads somewhere. Keeps hover behaviour in one place. */
export function Row({ children }: { children: ReactNode }) {
  return <tr className="transition-colors hover:bg-canvas">{children}</tr>;
}

/* ── Form controls ────────────────────────────────────────────────────── */

export const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-brand-bright focus:ring-2 focus:ring-brand-line focus:outline-none';

export const buttonClass = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60',
  secondary:
    'inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-canvas disabled:opacity-60',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-lg border border-bad-line bg-bad-light px-3.5 py-2 text-sm font-medium text-bad transition-colors hover:bg-bad hover:text-white disabled:opacity-60',
} as const;

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-soft">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

/** A label and a value, for the read-only detail panels. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold tracking-wide text-faint uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

/* ── Skeletons ────────────────────────────────────────────────────────── */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/** The shape of a stat row, so the figures do not shift when they arrive. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-xl border border-line bg-surface px-5 py-4 shadow-card">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Loading">
      <div className="flex gap-4 border-b border-line bg-canvas px-5 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 border-b border-line-soft px-5 py-4">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className="h-3.5 flex-1"
              // A ragged right edge reads as text rather than as a grid.
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-3 px-5 py-5" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index}>
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="mt-2 h-4 w-full max-w-[16rem]" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonHeading() {
  return (
    <div className="mb-6">
      <Skeleton className="h-6 w-52" />
      <Skeleton className="mt-2 h-3.5 w-80 max-w-full" />
    </div>
  );
}
