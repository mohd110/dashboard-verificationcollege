import Link from 'next/link';

import { Card, DataTable, EmptyState, Hash, PageHeading, ResultBadge, Row } from '@/components/ui';
import { listCampusEventsForUniversity } from '@/lib/events';
import { formatDateTime } from '@/lib/format';
import { can, requireRecordsSession } from '@/lib/records/access';
import { EVENT_LABELS } from '@/lib/types';

export const metadata = { title: 'Activity Trail · GBPUAT Smart Identity' };

/**
 * The university's activity trail.
 *
 * Every line is one campus event, sealed into a hash chain in the order it
 * happened. A gate scan, a library issue and a card being blocked all land
 * here through the same function, from three different applications, which is
 * the whole point of the record: one history rather than three.
 *
 * The chain position is shown because it is what makes the trail checkable. If
 * an old row were quietly edited its hash would no longer match, and the
 * integrity screen would say so.
 */
export default async function RecordsActivityPage() {
  const session = await requireRecordsSession('activity.read');
  const events = await listCampusEventsForUniversity(session.universityId, { limit: 200 });
  const mayOpenStudent = can(session, 'students.read');

  return (
    <>
      <PageHeading
        title="Activity Trail"
        description="Every recorded campus event for this university, newest first."
      />

      <Card title="Recent activity" description={`${events.length} events`}>
        {events.length === 0 ? (
          <EmptyState title="Nothing recorded yet">
            No campus activity has been written for this university.
          </EmptyState>
        ) : (
          <DataTable head={['#', 'When', 'Event', 'Student', 'Where', 'By', 'Result']}>
            {events.map((event) => (
              <Row key={event.id}>
                <td className="px-5 py-3 font-mono text-xs tabular-nums text-faint">
                  {event.seq}
                </td>
                <td className="px-5 py-3 text-sm whitespace-nowrap">
                  {formatDateTime(event.occurredAt)}
                </td>
                <td className="px-5 py-3 text-sm font-medium">{EVENT_LABELS[event.eventType]}</td>
                <td className="px-5 py-3 text-sm">
                  {event.person ? (
                    mayOpenStudent ? (
                      <Link
                        href={`/records/students/${event.person.id}`}
                        className="text-ink hover:text-brand-mid hover:underline"
                      >
                        {event.person.fullName}
                      </Link>
                    ) : (
                      event.person.fullName
                    )
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-5 py-3 text-sm">{event.location?.name ?? '—'}</td>
                <td className="px-5 py-3 text-sm">{event.actor?.fullName ?? 'System'}</td>
                <td className="px-5 py-3">
                  <ResultBadge result={event.result} />
                </td>
              </Row>
            ))}
          </DataTable>
        )}
      </Card>

      <p className="mt-4 text-xs text-faint">
        Chain positions run without gaps. A missing or out-of-order number means the record has
        been tampered with, which the integrity check will confirm.
      </p>
    </>
  );
}
