import Link from 'next/link';
import { BadgeCheck, Ban, Clock, IdCard } from 'lucide-react';

import {
  Card,
  DataTable,
  EmptyState,
  Hash,
  LifecycleBadge,
  PageHeading,
  Row,
  StatTile,
  inputClass,
  buttonClass,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import { sanitiseSearch } from '@/lib/search';
import { requireAdminSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { CredentialState } from '@/lib/types';

export const metadata = { title: 'Cards · GBPUAT Smart Identity' };

const STATES: CredentialState[] = ['active', 'suspended', 'revoked', 'superseded', 'expired'];

type CredentialRow = {
  id: string;
  jti: string;
  issued_at: string | null;
  expires_at: string | null;
  people: { id: string; full_name: string | null; student_id: string | null } | null;
  credential_status: { status: CredentialState } | { status: CredentialState }[] | null;
  issuer_keys: { kid: string } | null;
};

function stateOf(row: CredentialRow): CredentialState | 'unknown' {
  const status = row.credential_status;
  if (!status) return 'unknown';
  return Array.isArray(status) ? (status[0]?.status ?? 'unknown') : status.status;
}

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string }>;
}) {
  await requireAdminSession();
  const { q, state } = await searchParams;

  const search = sanitiseSearch(q ?? '');
  const stateFilter = STATES.includes(state as CredentialState)
    ? (state as CredentialState)
    : undefined;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credentials')
    .select(
      `id, jti, issued_at, expires_at,
       people ( id, full_name, student_id ),
       credential_status ( status ),
       issuer_keys ( kid )`,
    )
    .order('issued_at', { ascending: false })
    .limit(300);

  if (error) throw new Error(error.message);

  const all = (data ?? []) as unknown as CredentialRow[];

  const cards = all.filter((row) => {
    if (stateFilter && stateOf(row) !== stateFilter) return false;
    if (!search) return true;

    const haystack = `${row.people?.full_name ?? ''} ${row.people?.student_id ?? ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const now = Date.now();
  const active = all.filter((row) => stateOf(row) === 'active').length;
  const blocked = all.filter((row) => ['revoked', 'suspended'].includes(stateOf(row))).length;
  const expiringSoon = all.filter((row) => {
    if (stateOf(row) !== 'active' || !row.expires_at) return false;
    const days = (new Date(row.expires_at).getTime() - now) / 86_400_000;
    return days > 0 && days <= 60;
  }).length;

  return (
    <>
      <PageHeading
        title="Cards"
        description="Every signed credential this university has issued."
        action={
          <Link href="/admin/students" className={buttonClass.primary}>
            <IdCard size={15} />
            Issue a card
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Issued"
          value={all.length}
          note="All time"
          tone="blue"
          icon={<IdCard size={17} />}
        />
        <StatTile
          label="Active"
          value={active}
          note="Verify at the gate"
          tone="green"
          icon={<BadgeCheck size={17} />}
        />
        <StatTile
          label="Blocked"
          value={blocked}
          note="Revoked or suspended"
          tone="red"
          icon={<Ban size={17} />}
        />
        <StatTile
          label="Expiring"
          value={expiringSoon}
          note="Within 60 days"
          tone="amber"
          icon={<Clock size={17} />}
        />
      </div>

      <div className="mt-6">
        <Card
          title={`${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`}
          action={
            <form className="flex flex-wrap gap-2">
              <input
                name="q"
                defaultValue={search}
                placeholder="Name or student number"
                aria-label="Search cards"
                className={`${inputClass} w-56`}
              />
              <select
                name="state"
                defaultValue={stateFilter ?? ''}
                aria-label="Credential state"
                className={`${inputClass} w-36`}
              >
                <option value="">Any state</option>
                {STATES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <button type="submit" className={buttonClass.secondary}>
                Filter
              </button>
            </form>
          }
        >
          {cards.length === 0 ? (
            <EmptyState title="Nothing to show">
              {all.length === 0
                ? 'No card has been issued yet. Open a student and issue their first one.'
                : 'No card matches the current filters.'}
            </EmptyState>
          ) : (
            <DataTable head={['Student', 'Credential', 'Signed by', 'Issued', 'Expires', 'State', '']}>
              {cards.map((row) => (
                <Row key={row.id}>
                  <td className="px-5 py-3">
                    {row.people ? (
                      <Link
                        href={`/admin/students/${row.people.id}`}
                        className="font-medium text-brand-mid hover:underline"
                      >
                        {row.people.full_name ?? 'Unnamed'}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                    <span className="block font-mono text-xs text-faint">
                      {row.people?.student_id ?? '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Hash>{row.jti}</Hash>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{row.issuer_keys?.kid ?? '—'}</td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {row.issued_at ? formatDate(row.issued_at) : '—'}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {row.expires_at ? formatDate(row.expires_at) : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <LifecycleBadge state={stateOf(row)} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/cards/${row.id}`}
                      className="text-sm font-medium text-brand-mid hover:underline"
                    >
                      Open
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
