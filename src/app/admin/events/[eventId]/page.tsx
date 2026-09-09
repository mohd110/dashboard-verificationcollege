import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { actorLabel } from '@/components/event-table';
import { Card, Hash, Notice, PageHeading, ResultBadge } from '@/components/ui';
import { checkEventIntegrity, getCampusEvent, getChainStatus } from '@/lib/events';
import { formatDateTime } from '@/lib/format';
import { requireAdminSession } from '@/lib/session';
import { EVENT_LABELS, ROLE_LABELS } from '@/lib/types';

export const metadata = { title: 'Event · GBPUAT Smart Identity' };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-line px-5 py-3 last:border-b-0">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
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
          <Link href="/admin/activity" className="text-sm text-brand hover:underline">
            Back to activity
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card title="Record">
          <dl>
            <Field label="Event type">{EVENT_LABELS[event.eventType]}</Field>
            <Field label="Student">
              {event.person ? (
                <Link
                  href={`/admin/students/${event.person.id}`}
                  className="text-brand hover:underline"
                >
                  {event.person.fullName} · {event.person.personCode}
                </Link>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Actor">{actorLabel(event)}</Field>
            <Field label="Role">
              {event.actorRole ? ROLE_LABELS[event.actorRole] : 'System, no human actor'}
            </Field>
            <Field label="Location">{event.location?.name ?? '—'}</Field>
            <Field label="Entity">
              {event.entityType ? `${event.entityType} ${event.entityId ?? ''}`.trim() : '—'}
            </Field>
            <Field label="Result">
              <ResultBadge result={event.result} />
            </Field>
            <Field label="Timestamp">{formatDateTime(event.occurredAt)}</Field>
            <Field label="Metadata">
              {metadataEntries.length === 0 ? (
                '—'
              ) : (
                <ul className="space-y-1">
                  {metadataEntries.map(([key, value]) => (
                    <li key={key} className="font-mono text-xs break-all">
                      <span className="text-muted">{key}: </span>
                      {String(value)}
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          </dl>
        </Card>

        <div className="space-y-6">
          <Card title="Integrity">
            <dl>
              <Field label="Record integrity">
                <span className={recordValid ? 'font-semibold text-ok' : 'font-semibold text-bad'}>
                  {recordValid ? 'VALID' : 'INVALID'}
                </span>
                <span className="block text-xs text-muted">
                  {recordValid
                    ? 'The stored hash matches a fresh hash of this record.'
                    : 'The stored hash does not match this record. It has been altered.'}
                </span>
              </Field>
              <Field label="Event hash">
                <Hash>{event.eventHash}</Hash>
              </Field>
              <Field label="Previous hash">
                <Hash>{event.prevHash}</Hash>
              </Field>
              <Field label="Chain status">
                <span
                  className={chainUnbroken ? 'font-semibold text-ok' : 'font-semibold text-bad'}
                >
                  {chain.status}
                </span>
                <span className="block text-xs text-muted">
                  {chainUnbroken
                    ? `All ${chain.events} events on this campus re-hash correctly.`
                    : `The chain first fails at position ${chain.first_broken_seq}.`}
                </span>
              </Field>
              <Field label="Blockchain anchor">
                <span className="font-semibold text-muted">NOT YET ANCHORED</span>
              </Field>
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
