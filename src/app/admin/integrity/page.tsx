import { Suspense } from 'react';
import Link from 'next/link';
import { Link2, ListChecks, Anchor } from 'lucide-react';

import {
  Card,
  DataTable,
  EmptyState,
  Hash,
  Notice,
  PageHeading,
  Row,
  SkeletonCard,
  SkeletonStats,
  SkeletonTable,
  StatTile,
} from '@/components/ui';
import { getChainStatus, verifyChain } from '@/lib/events';
import { formatDateTime } from '@/lib/format';
import { requireAdminSession } from '@/lib/session';
import { EVENT_LABELS } from '@/lib/types';

export const metadata = { title: 'Integrity · GBPUAT Smart Identity' };

async function Chain({ universityId }: { universityId: string }) {
  // Both of these re-hash the stored records in the database on every load.
  // Nothing is cached, so what is shown here is the state right now.
  const [status, rows] = await Promise.all([
    getChainStatus(universityId),
    verifyChain(universityId),
  ]);

  const broken = rows.filter((row) => !row.prev_hash_ok || !row.event_hash_ok);
  const recent = [...rows].reverse().slice(0, 20);
  const unbroken = status.status === 'UNBROKEN';

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Events in chain"
          value={status.events}
          tone="blue"
          icon={<ListChecks size={17} />}
        />
        <StatTile
          label="Chain status"
          value={status.status}
          tone={unbroken ? 'green' : 'red'}
          icon={<Link2 size={17} />}
          note={
            unbroken
              ? 'Every record re-hashes to its stored value'
              : `First failure at position ${status.first_broken_seq}`
          }
        />
        <StatTile
          label="Blockchain anchor"
          value="NOT ANCHORED"
          tone="grey"
          icon={<Anchor size={17} />}
          note="No chain is in use"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card title="Head of chain" padded>
          <div className="space-y-4">
            <div>
              <p className="text-[0.6875rem] font-semibold tracking-wide text-faint uppercase">
                Latest hash
              </p>
              <p className="mt-1">
                <Hash>{status.head_hash ?? 'No events recorded yet'}</Hash>
              </p>
            </div>
            <div>
              <p className="text-[0.6875rem] font-semibold tracking-wide text-faint uppercase">
                Checked at
              </p>
              <p className="mt-1 text-sm">{formatDateTime(status.checked_at)}</p>
            </div>
          </div>
        </Card>

        <Notice
          tone={unbroken ? 'info' : 'bad'}
          title={unbroken ? 'What this proves' : 'History has been altered'}
        >
          {unbroken
            ? 'Each event stores the hash of the one before it, and the database refuses updates and deletes outright. Changing any past record would break every hash after it, which this page would show. Nothing here is anchored to a blockchain, and no transaction identifier is invented to suggest otherwise.'
            : 'At least one stored record no longer matches its hash. Treat the affected events and everything after them as unreliable and investigate how the row was changed.'}
        </Notice>
      </div>

      {broken.length > 0 ? (
        <div className="mt-6">
          <Card title={`${broken.length} broken ${broken.length === 1 ? 'record' : 'records'}`}>
            <DataTable head={['Position', 'Event', 'When', 'Own hash', 'Link to previous']}>
              {broken.map((row) => (
                <Row key={row.event_id}>
                  <td className="px-5 py-3 tabular-nums">{row.seq}</td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/events/${row.event_id}`}
                      className="font-medium text-brand-mid hover:underline"
                    >
                      {EVENT_LABELS[row.event_type]}
                    </Link>
                  </td>
                  <td className="px-5 py-3">{formatDateTime(row.occurred_at)}</td>
                  <td className="px-5 py-3 font-semibold text-bad">
                    {row.event_hash_ok ? 'OK' : 'MISMATCH'}
                  </td>
                  <td className="px-5 py-3 font-semibold text-bad">
                    {row.prev_hash_ok ? 'OK' : 'BROKEN'}
                  </td>
                </Row>
              ))}
            </DataTable>
          </Card>
        </div>
      ) : null}

      <div className="mt-6">
        <Card title="Most recent records" description="Newest twenty, re-hashed just now">
          {recent.length === 0 ? (
            <EmptyState title="No chain yet">
              Nothing has been recorded, so there is nothing to check.
            </EmptyState>
          ) : (
            <DataTable head={['Position', 'Event', 'When', 'Record', 'Chain link', '']}>
              {recent.map((row) => (
                <Row key={row.event_id}>
                  <td className="px-5 py-3 tabular-nums">{row.seq}</td>
                  <td className="px-5 py-3 font-medium">{EVENT_LABELS[row.event_type]}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{formatDateTime(row.occurred_at)}</td>
                  <td
                    className={`px-5 py-3 font-semibold ${row.event_hash_ok ? 'text-ok' : 'text-bad'}`}
                  >
                    {row.event_hash_ok ? 'VALID' : 'MISMATCH'}
                  </td>
                  <td
                    className={`px-5 py-3 font-semibold ${row.prev_hash_ok ? 'text-ok' : 'text-bad'}`}
                  >
                    {row.prev_hash_ok ? 'UNBROKEN' : 'BROKEN'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/events/${row.event_id}`}
                      className="text-sm font-medium text-brand-mid hover:underline"
                    >
                      Details
                    </Link>
                  </td>
                </Row>
              ))}
            </DataTable>
          )}
        </Card>
      </div>
    </>
  );
}

export default async function IntegrityPage() {
  const session = await requireAdminSession();

  return (
    <>
      <PageHeading
        title="Integrity"
        description="Every campus event re-hashed and checked against the record before it."
      />

      <Suspense
        fallback={
          <>
            <SkeletonStats count={3} />
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card title="Head of chain">
                <SkeletonCard lines={2} />
              </Card>
            </div>
            <div className="mt-6">
              <Card title="Most recent records">
                <SkeletonTable rows={6} columns={6} />
              </Card>
            </div>
          </>
        }
      >
        <Chain universityId={session.universityId} />
      </Suspense>
    </>
  );
}
