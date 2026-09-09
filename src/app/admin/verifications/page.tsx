import { Suspense } from 'react';
import { CalendarDays, ScanLine, ShieldAlert } from 'lucide-react';

import { EventFilters, type FilterValues } from '@/components/event-filters';
import { EventTable } from '@/components/event-table';
import {
  Card,
  PageHeading,
  Skeleton,
  SkeletonStats,
  SkeletonTable,
  StatTile,
} from '@/components/ui';
import { listCampusEvents } from '@/lib/events';
import { campusToday } from '@/lib/format';
import { loadFilterOptions } from '@/lib/filter-options';
import { requireAdminSession } from '@/lib/session';
import type { CampusEventResult, CampusEventType } from '@/lib/types';
import { FAILED_RESULTS } from '@/lib/types';

export const metadata = { title: 'Verification History · GBPUAT Smart Identity' };

/** Identity checks only. Book and notification activity lives on the trail. */
const IDENTITY_EVENTS: CampusEventType[] = ['IDENTITY_VERIFIED', 'IDENTITY_REJECTED'];
const IDENTITY_RESULTS: CampusEventResult[] = ['VALID', 'INVALID', 'REVOKED', 'EXPIRED'];

async function Filters({ values }: { values: FilterValues }) {
  const options = await loadFilterOptions();

  return (
    <EventFilters
      action="/admin/verifications"
      values={values}
      students={options.students}
      locations={options.locations}
      actors={options.actors}
      results={IDENTITY_RESULTS}
    />
  );
}

function FilterSkeleton() {
  return (
    <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index}>
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="mt-2 h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

async function Verifications({ values }: { values: FilterValues }) {
  const result = IDENTITY_RESULTS.includes(values.result as CampusEventResult)
    ? (values.result as CampusEventResult)
    : undefined;

  const events = await listCampusEvents({
    personId: values.personId || undefined,
    locationId: values.locationId || undefined,
    actorId: values.actorId || undefined,
    result,
    eventTypes: IDENTITY_EVENTS,
    fromDate: values.from || undefined,
    toDate: values.to || undefined,
    limit: 300,
  });

  const today = campusToday();
  const rejected = events.filter((event) => FAILED_RESULTS.includes(event.result)).length;
  const todayCount = events.filter((event) => event.occurredAt.startsWith(today)).length;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Shown"
          value={events.length}
          note="Matching the current filters"
          tone="blue"
          icon={<ScanLine size={17} />}
        />
        <StatTile
          label="Rejected"
          value={rejected}
          note="Not accepted at the point of scan"
          tone="red"
          icon={<ShieldAlert size={17} />}
        />
        <StatTile
          label="Today"
          value={todayCount}
          note="Within the filtered set"
          tone="amber"
          icon={<CalendarDays size={17} />}
        />
      </div>

      <div className="mt-6">
        <Card
          title={`${events.length} ${events.length === 1 ? 'verification' : 'verifications'}`}
        >
          <EventTable events={events} />
        </Card>
      </div>
    </>
  );
}

export default async function VerificationHistoryPage({
  searchParams,
}: {
  searchParams: Promise<FilterValues>;
}) {
  await requireAdminSession();
  const values = await searchParams;
  const key = new URLSearchParams(values as Record<string, string>).toString();

  return (
    <>
      <PageHeading
        title="Verification History"
        description="Identity checks recorded at campus gates and entrances."
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
            <>
              <SkeletonStats count={3} />
              <div className="mt-6">
                <Card title="Loading verifications">
                  <SkeletonTable rows={8} columns={7} />
                </Card>
              </div>
            </>
          }
        >
          <Verifications values={values} />
        </Suspense>
      </div>
    </>
  );
}
