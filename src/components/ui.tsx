import type { ReactNode } from 'react';

import type { CampusEventResult } from '@/lib/types';
import { FAILED_RESULTS } from '@/lib/types';

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      {title ? (
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">{title}</h2>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted">{children}</p>;
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
      <div>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: number | string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

const RESULT_TONE = {
  good: 'bg-ok-light text-ok',
  bad: 'bg-bad-light text-bad',
} as const;

export function ResultBadge({ result }: { result: CampusEventResult }) {
  const tone = FAILED_RESULTS.includes(result) ? 'bad' : 'good';
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold tracking-wide ${RESULT_TONE[tone]}`}
    >
      {result}
    </span>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
        active ? RESULT_TONE.good : 'bg-canvas text-muted'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export function Hash({ children }: { children: ReactNode }) {
  return <code className="font-mono text-xs break-all text-muted">{children}</code>;
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'bad';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: 'border-brand/20 bg-brand-light text-brand-dark',
    warn: 'border-warn/25 bg-warn-light text-warn',
    bad: 'border-bad/25 bg-bad-light text-bad',
  } as const;

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : ''}>{children}</div>
    </div>
  );
}

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
      <table className={`w-full border-collapse text-sm ${compact ? '' : 'min-w-[42rem]'}`}>
        <thead>
          <tr className="border-b border-line text-left">
            {head.map((cell, index) => (
              <th
                key={index}
                className="px-5 py-2.5 text-xs font-semibold tracking-wide text-muted uppercase"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
