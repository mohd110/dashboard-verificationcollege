import Link from 'next/link';

import type { CampusEvent } from '@/lib/events';
import { formatDate, formatTime } from '@/lib/format';
import { EVENT_LABELS, FAILED_RESULTS } from '@/lib/types';

import { actorLabel } from './event-table';
import { EmptyState, ResultBadge } from './ui';

/**
 * One student's history, oldest first, grouped by day.
 *
 * Every line is read straight from campus_events. Nothing here is a fixture,
 * so an empty trail means the student has genuinely not been scanned yet.
 */
export function ActivityTrail({ events }: { events: CampusEvent[] }) {
  if (events.length === 0) {
    return <EmptyState>No campus activity recorded for this student yet.</EmptyState>;
  }

  const days = new Map<string, CampusEvent[]>();
  for (const event of events) {
    const day = formatDate(event.occurredAt);
    const bucket = days.get(day);
    if (bucket) bucket.push(event);
    else days.set(day, [event]);
  }

  return (
    <div className="px-5 py-5">
      {[...days.entries()].map(([day, dayEvents]) => (
        <section key={day} className="mb-6 last:mb-0">
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{day}</h3>

          <ol className="relative border-l border-line pl-6">
            {dayEvents.map((event) => {
              const failed = FAILED_RESULTS.includes(event.result);

              return (
                <li key={event.id} className="relative mb-5 last:mb-0">
                  <span
                    aria-hidden
                    className={`absolute -left-[1.9rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${
                      failed ? 'bg-bad' : 'bg-brand'
                    }`}
                  />

                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-sm tabular-nums text-muted">
                      {formatTime(event.occurredAt)}
                    </span>
                    <span className="font-medium">{EVENT_LABELS[event.eventType]}</span>
                    <ResultBadge result={event.result} />
                  </div>

                  <p className="mt-0.5 text-sm text-muted">
                    {event.location?.name ?? 'No location'} · {actorLabel(event)}
                  </p>

                  <Link
                    href={`/admin/events/${event.id}`}
                    className="mt-1 inline-block text-xs text-brand hover:underline"
                  >
                    Event details
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
