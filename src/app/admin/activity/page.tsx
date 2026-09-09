import { Suspense } from 'react';

import { EventFilters, type FilterValues } from '@/components/event-filters';
import { EventTable } from '@/components/event-table';
import { Card, PageHeading, Skeleton, SkeletonTable } from '@/components/ui';
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

async function Filters({ values }: { values: FilterValues }) {
  const options = await loadFilterOptions();

  return (
    <EventFilters
      action="/admin/activity"
      values={values}
      students={options.students}
      locations={options.locations}
      actors={options.actors}
      results={ALL_RESULTS}
      eventTypes={ALL_EVENT_TYPES}
    />
  );
}

function FilterSkeleton() {
  return (
    <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index}>
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="mt-2 h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

async function Events({ values }: { values: FilterValues }) {
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
    <Card title={`${events.length} ${events.length === 1 ? 'event' : 'events'}`}>
      <EventTable events={events} />
    </Card>
  );
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<FilterValues>;
}) {
  await requireAdminSession();
  const values = await searchParams;

  // The two halves are independent, and the filter dropdowns are the slower of
  // them. Streaming them separately means the results table is not held up by
  // a list of 150 student names.
  const key = new URLSearchParams(values as Record<string, string>).toString();

  return (
    <>
      <PageHeading
        title="Activity Trail"
        description="Every campus event, newest first, exactly as recorded."
      />

      <Card title="Filters">
        <Suspense fallback={<FilterSkeleton />}>
          <Filters values={values} />
        </Suspense>
      </Card>

      <div className="mt-6">
        <Suspense
          key={key}
          fallback={
            <Card title="Loading events">
              <SkeletonTable rows={8} columns={7} />
            </Card>
          }
        >
          <Events values={values} />
        </Suspense>
      </div>
    </>
  );
}
