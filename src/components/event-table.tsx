import Link from 'next/link';

import type { CampusEvent } from '@/lib/events';
import { formatDate, formatTime } from '@/lib/format';
import { EVENT_LABELS, ROLE_LABELS } from '@/lib/types';

import { DataTable, EmptyState, ResultBadge, Row } from './ui';

/** Who caused the event. Machine activity has no actor by design. */
export function actorLabel(event: CampusEvent): string {
  if (!event.actor) return 'System';
  const role = event.actorRole ? ` · ${ROLE_LABELS[event.actorRole]}` : '';
  return `${event.actor.fullName}${role}`;
}

export function EventTable({
  events,
  showStudent = true,
  showDate = true,
}: {
  events: CampusEvent[];
  showStudent?: boolean;
  showDate?: boolean;
}) {
  if (events.length === 0) {
    return (
      <EmptyState title="Nothing recorded yet">
        Campus events appear here as soon as a card is scanned, a book moves or a card is issued.
      </EmptyState>
    );
  }

  const head = [
    showDate ? 'When' : 'Time',
    'Event',
    ...(showStudent ? ['Student'] : []),
    'Where',
    'Who',
    'Result',
    '',
  ];

  return (
    <DataTable head={head}>
      {events.map((event) => (
        <Row key={event.id}>
          <td className="px-5 py-3 whitespace-nowrap tabular-nums">
            <span className="font-medium">{formatTime(event.occurredAt)}</span>
            {showDate ? (
              <span className="block text-xs text-faint">{formatDate(event.occurredAt)}</span>
            ) : null}
          </td>
          <td className="px-5 py-3 font-medium whitespace-nowrap">
            {EVENT_LABELS[event.eventType]}
          </td>
          {showStudent ? (
            <td className="px-5 py-3">
              {event.person ? (
                <Link
                  href={`/admin/students/${event.person.id}`}
                  className="font-medium text-brand-mid hover:underline"
                >
                  {event.person.fullName}
                </Link>
              ) : (
                <span className="text-faint">—</span>
              )}
            </td>
          ) : null}
          <td className="px-5 py-3">{event.location?.name ?? <span className="text-faint">—</span>}</td>
          <td className="px-5 py-3">{actorLabel(event)}</td>
          <td className="px-5 py-3">
            <ResultBadge result={event.result} />
          </td>
          <td className="px-5 py-3 text-right">
            <Link
              href={`/admin/events/${event.id}`}
              className="text-sm font-medium text-brand-mid hover:underline"
            >
              Details
            </Link>
          </td>
        </Row>
      ))}
    </DataTable>
  );
}
