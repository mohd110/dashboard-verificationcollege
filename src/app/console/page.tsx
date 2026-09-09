import { Card, DataTable, EmptyState, Notice, PageHeading, ResultBadge } from '@/components/ui';
import { listCampusEvents } from '@/lib/events';
import { formatTime } from '@/lib/format';
import { requireStaffSession } from '@/lib/session';
import { EVENT_LABELS, LOCATION_TYPE_LABELS } from '@/lib/types';
import { isUsingStandInProvider } from '@/lib/verification/verify';

import { ScanPanel } from './scan-panel';

export const metadata = { title: 'Verification Console · GBPUAT Smart Identity' };

export default async function ConsolePage() {
  const session = await requireStaffSession();

  if (!session.posting) {
    return (
      <>
        <PageHeading title="Verification Console" />
        <Notice tone="warn" title="No posting">
          You have not been posted to a gate or a library, so a scan would have nowhere to be
          recorded. An administrator can assign you a location on the Users screen.
        </Notice>
      </>
    );
  }

  const posting = session.posting;
  const recent = await listCampusEvents({ locationId: posting.id, limit: 15 });

  return (
    <>
      <PageHeading
        title="Verification Console"
        description={`${LOCATION_TYPE_LABELS[posting.type]} · ${posting.name} · operated by ${session.fullName}`}
      />

      {isUsingStandInProvider() ? (
        <div className="mb-6">
          <Notice tone="warn" title="Stand-in verification is switched on">
            Scans are being matched against the student register only. No card signature is being
            checked, and every event recorded this way says so.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <Card title={`Scan · ${posting.name}`}>
          <div className="px-5 py-5">
            <ScanPanel locationName={posting.name} />
          </div>
        </Card>

        <Card title="Your recent scans here">
          {recent.length === 0 ? (
            <EmptyState>Nothing scanned at this location yet.</EmptyState>
          ) : (
            <DataTable compact head={['Time', 'Event', 'Student', 'Result']}>
              {recent.map((event) => (
                <tr key={event.id}>
                  <td className="px-5 py-2.5 font-mono text-xs tabular-nums">
                    {formatTime(event.occurredAt)}
                  </td>
                  <td className="px-5 py-2.5 text-sm">{EVENT_LABELS[event.eventType]}</td>
                  <td className="px-5 py-2.5 text-sm">{event.person?.fullName ?? '—'}</td>
                  <td className="px-5 py-2.5">
                    <ResultBadge result={event.result} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      </div>
    </>
  );
}
