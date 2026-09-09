import Link from 'next/link';

import { Card, DataTable, EmptyState, Hash, Notice, PageHeading, StatTile } from '@/components/ui';
import { getChainStatus, verifyChain } from '@/lib/events';
import { formatDateTime } from '@/lib/format';
import { requireAdminSession } from '@/lib/session';
import { EVENT_LABELS } from '@/lib/types';

export const metadata = { title: 'Integrity · GBPUAT Smart Identity' };

export default async function IntegrityPage() {
  const session = await requireAdminSession();

  // Both of these re-hash the stored records in the database on every load.
  // Nothing is cached, so what is shown here is the state right now.
  const [status, rows] = await Promise.all([
    getChainStatus(session.universityId),
    verifyChain(session.universityId),
  ]);

  const broken = rows.filter((row) => !row.prev_hash_ok || !row.event_hash_ok);
  const recent = [...rows].reverse().slice(0, 20);
  const unbroken = status.status === 'UNBROKEN';

  return (
    <>
      <PageHeading
        title="Integrity"
        description="Every campus event re-hashed and checked against the record before it."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Events in chain" value={status.events} />
        <StatTile
          label="Chain status"
          value={status.status}
          note={
            unbroken
              ? 'Every record re-hashes to its stored value'
              : `First failure at position ${status.first_broken_seq}`
          }
        />
        <StatTile label="Blockchain anchor" value="NOT ANCHORED" note="No chain is in use" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card title="Head of chain">
          <div className="space-y-3 px-5 py-5">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Latest hash</p>
              <p className="mt-1">
                <Hash>{status.head_hash ?? 'No events recorded yet'}</Hash>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Checked at</p>
              <p className="mt-1 text-sm">{formatDateTime(status.checked_at)}</p>
            </div>
          </div>
        </Card>

        <Notice tone={unbroken ? 'info' : 'bad'} title={unbroken ? 'What this proves' : 'History has been altered'}>
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
                <tr key={row.event_id}>
                  <td className="px-5 py-3 tabular-nums">{row.seq}</td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/events/${row.event_id}`}
                      className="text-brand hover:underline"
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
                </tr>
              ))}
            </DataTable>
          </Card>
        </div>
      ) : null}

      <div className="mt-6">
        <Card title="Most recent records">
          {recent.length === 0 ? (
            <EmptyState>Nothing has been recorded yet, so there is no chain to check.</EmptyState>
          ) : (
            <DataTable head={['Position', 'Event', 'When', 'Record', 'Chain link', '']}>
              {recent.map((row) => (
                <tr key={row.event_id} className="hover:bg-canvas">
                  <td className="px-5 py-3 tabular-nums">{row.seq}</td>
                  <td className="px-5 py-3">{EVENT_LABELS[row.event_type]}</td>
                  <td className="px-5 py-3">{formatDateTime(row.occurred_at)}</td>
                  <td className={`px-5 py-3 ${row.event_hash_ok ? 'text-ok' : 'text-bad'}`}>
                    {row.event_hash_ok ? 'VALID' : 'MISMATCH'}
                  </td>
                  <td className={`px-5 py-3 ${row.prev_hash_ok ? 'text-ok' : 'text-bad'}`}>
                    {row.prev_hash_ok ? 'UNBROKEN' : 'BROKEN'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/events/${row.event_id}`}
                      className="text-sm text-brand hover:underline"
                    >
                      Details
                    </Link>
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
