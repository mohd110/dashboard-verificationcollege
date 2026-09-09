import { Suspense } from 'react';

import {
  Card,
  DataTable,
  EmptyState,
  Notice,
  PageHeading,
  ResultBadge,
  SkeletonTable,
} from '@/components/ui';
import { listCampusEvents } from '@/lib/events';
import { formatTime } from '@/lib/format';
import { requireStaffSession, type Posting } from '@/lib/session';
import { EVENT_LABELS, LOCATION_TYPE_LABELS } from '@/lib/types';
import { allowsPrintedNumbers } from '@/lib/verification/verify';

import { ScanPanel } from './scan-panel';

export const metadata = { title: 'Verification Console · GBPUAT Smart Identity' };

async function RecentScans({ posting }: { posting: Posting }) {
  const recent = await listCampusEvents({ locationId: posting.id, limit: 15 });

  if (recent.length === 0) {
    return <EmptyState title="Nothing yet">No card has been scanned at this location.</EmptyState>;
  }

  return (
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
  );
}

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

  return (
    <>
      <PageHeading
        title="Verification Console"
        description={`${LOCATION_TYPE_LABELS[posting.type]} · ${posting.name} · operated by ${session.fullName}`}
      />

      {allowsPrintedNumbers() ? (
        <div className="mb-6">
          <Notice tone="warn" title="Typed student numbers are accepted here">
            A scanned QR code is checked against the university signature. A number typed by hand is
            only looked up on the register, so it proves the number exists rather than that the card
            is genuine. Every event recorded that way says so.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_23rem] lg:items-start">
        <Card title={`Scan · ${posting.name}`} padded>
          <ScanPanel locationName={posting.name} />
        </Card>

        <Card title="Recent scans here" description="The last fifteen at this location">
          <Suspense fallback={<SkeletonTable rows={6} columns={4} />}>
            <RecentScans posting={posting} />
          </Suspense>
        </Card>
      </div>
    </>
  );
}
