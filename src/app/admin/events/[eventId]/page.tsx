import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { actorLabel } from '@/components/event-table';
import { Card, Hash, Notice, PageHeading, ResultBadge } from '@/components/ui';
import { checkEventIntegrity, getCampusEvent, getChainStatus } from '@/lib/events';
import { formatDateTime } from '@/lib/format';
import { requireAdminSession } from '@/lib/session';
import { EVENT_LABELS, ROLE_LABELS } from '@/lib/types';

export const metadata = { title: 'Event · GBPUAT Smart Identity' };

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-line-soft px-5 py-3 last:border-b-0">
      <dt className="text-[0.6875rem] font-semibold tracking-wide text-faint uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await requireAdminSession();
  const { eventId } = await params;

  const event = await getCampusEvent(eventId);
  if (!event) notFound();

  const [integrity, chain] = await Promise.all([
    checkEventIntegrity(event.id),
    getChainStatus(session.universityId),
  ]);

  const recordValid = integrity.record_integrity === 'VALID';
  const chainUnbroken = chain.status === 'UNBROKEN';
  const metadataEntries = Object.entries(event.metadata);

  return (
    <>
      <PageHeading
        title={EVENT_LABELS[event.eventType]}
        description={`Chain position ${event.seq} · ${formatDateTime(event.occurredAt)}`}
        action={
          <Link
            href="/admin/activity"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-mid hover:underline"
          >
            <ArrowLeft size={14} />
            Back to activity
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card title="Record">
          <dl>
            <Line label="Event type">{EVENT_LABELS[event.eventType]}</Line>
            <Line label="Student">
              {event.person ? (
                <Link
                  href={`/admin/students/${event.person.id}`}
                  className="font-medium text-brand-mid hover:underline"
                >
                  {event.person.fullName}
                  {event.person.personCode ? ` · ${event.person.personCode}` : ''}
                </Link>
              ) : (
                '—'
              )}
            </Line>
            <Line label="Actor">{actorLabel(event)}</Line>
            <Line label="Role">
              {event.actorRole ? ROLE_LABELS[event.actorRole] : 'System, no human actor'}
            </Line>
            <Line label="Location">{event.location?.name ?? '—'}</Line>
            <Line label="Entity">
              {event.entityType ? (
                event.entityType === 'credential' && event.entityId ? (
                  <Link
                    href={`/admin/cards/${event.entityId}`}
                    className="font-medium text-brand-mid hover:underline"
                  >
                    Credential {event.entityId.slice(0, 8)}
                  </Link>
                ) : (
                  `${event.entityType} ${event.entityId ?? ''}`.trim()
                )
              ) : (
                '—'
              )}
            </Line>
            <Line label="Result">
              <ResultBadge result={event.result} />
            </Line>
            <Line label="Timestamp">{formatDateTime(event.occurredAt)}</Line>
            <Line label="Metadata">
              {metadataEntries.length === 0 ? (
                '—'
              ) : (
                <ul className="space-y-1">
                  {metadataEntries.map(([key, value]) => (
                    <li key={key} className="font-mono text-xs break-all">
                      <span className="text-faint">{key}: </span>
                      {String(value)}
                    </li>
                  ))}
                </ul>
              )}
            </Line>
          </dl>
        </Card>

        <div className="space-y-6">
          <Card title="Integrity">
            <dl>
              <Line label="Record integrity">
                <span className={recordValid ? 'font-bold text-ok' : 'font-bold text-bad'}>
                  {recordValid ? 'VALID' : 'INVALID'}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {recordValid
                    ? 'The stored hash matches a fresh hash of this record.'
                    : 'The stored hash does not match this record. It has been altered.'}
                </span>
              </Line>
              <Line label="Event hash">
                <Hash>{event.eventHash}</Hash>
              </Line>
              <Line label="Previous hash">
                <Hash>{event.prevHash}</Hash>
              </Line>
              <Line label="Chain status">
                <span className={chainUnbroken ? 'font-bold text-ok' : 'font-bold text-bad'}>
                  {chain.status}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {chainUnbroken
                    ? `All ${chain.events} events on this campus re-hash correctly.`
                    : `The chain first fails at position ${chain.first_broken_seq}.`}
                </span>
              </Line>
              <Line label="Blockchain anchor">
                <span className="font-bold text-muted">NOT YET ANCHORED</span>
              </Line>
            </dl>
          </Card>

          <Notice tone="info" title="What the anchor line means">
            The hash chain above is real and is recomputed from the stored record every time this
            page loads. No blockchain is involved, so no transaction identifier is shown. Anchoring
            a Merkle root of these hashes is future work.
          </Notice>
        </div>
      </div>
    </>
  );
}
