import { EventFilters, type FilterValues } from '@/components/event-filters';
import { EventTable } from '@/components/event-table';
import { Card, PageHeading, StatTile } from '@/components/ui';
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

export default async function VerificationHistoryPage({
  searchParams,
}: {
  searchParams: Promise<FilterValues>;
}) {
  await requireAdminSession();
  const values = await searchParams;
  const options = await loadFilterOptions();

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
  const shown = events.length;
  const rejected = events.filter((event) => FAILED_RESULTS.includes(event.result)).length;
  const todayCount = events.filter((event) => event.occurredAt.startsWith(today)).length;

  return (
    <>
      <PageHeading
        title="Verification History"
        description="Identity checks recorded at campus gates and entrances."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Shown" value={shown} note="Matching the current filters" />
        <StatTile label="Rejected" value={rejected} note="Not accepted at the point of scan" />
        <StatTile label="Today" value={todayCount} note="Within the filtered set" />
      </div>

      <div className="mt-6">
        <Card title="Filters">
          <EventFilters
            action="/admin/verifications"
            values={values}
            students={options.students}
            locations={options.locations}
            actors={options.actors}
            results={IDENTITY_RESULTS}
          />
        </Card>
      </div>

      <div className="mt-6">
        <Card title={`${shown} ${shown === 1 ? 'verification' : 'verifications'}`}>
          <EventTable events={events} />
        </Card>
      </div>
    </>
  );
}
