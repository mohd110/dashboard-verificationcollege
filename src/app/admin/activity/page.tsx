import { EventFilters, type FilterValues } from '@/components/event-filters';
import { EventTable } from '@/components/event-table';
import { Card, PageHeading } from '@/components/ui';
import { listCampusEvents } from '@/lib/events';
import { loadFilterOptions } from '@/lib/filter-options';
import { requireAdminSession } from '@/lib/session';
import type { CampusEventResult, CampusEventType } from '@/lib/types';
import { EVENT_LABELS } from '@/lib/types';

export const metadata = { title: 'Activity Trail · GBPUAT Smart Identity' };

const ALL_EVENT_TYPES = Object.keys(EVENT_LABELS) as CampusEventType[];
const ALL_RESULTS: CampusEventResult[] = [
  'VALID',
  'INVALID',
  'REVOKED',
  'EXPIRED',
  'SUCCESS',
  'FAILED',
  'SENT',
];

/** Keeps a hand-edited query string from reaching the database as nonsense. */
function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<FilterValues>;
}) {
  await requireAdminSession();
  const values = await searchParams;
  const options = await loadFilterOptions();

  const eventType = pick(values.eventType, ALL_EVENT_TYPES);

  const events = await listCampusEvents({
    personId: values.personId || undefined,
    locationId: values.locationId || undefined,
    actorId: values.actorId || undefined,
    result: pick(values.result, ALL_RESULTS),
    eventTypes: eventType ? [eventType] : undefined,
    fromDate: values.from || undefined,
    toDate: values.to || undefined,
    limit: 300,
  });

  return (
    <>
      <PageHeading
        title="Activity Trail"
        description="Every campus event, newest first, exactly as recorded."
      />

      <Card title="Filters">
        <EventFilters
          action="/admin/activity"
          values={values}
          students={options.students}
          locations={options.locations}
          actors={options.actors}
          results={ALL_RESULTS}
          eventTypes={ALL_EVENT_TYPES}
        />
      </Card>

      <div className="mt-6">
        <Card title={`${events.length} ${events.length === 1 ? 'event' : 'events'}`}>
          <EventTable events={events} />
        </Card>
      </div>
    </>
  );
}
