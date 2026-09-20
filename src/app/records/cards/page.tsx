import Link from 'next/link';
import { BadgeCheck, Ban, IdCard } from 'lucide-react';

import { ActionForm } from '@/components/action-form';
import {
  Card,
  DataTable,
  EmptyState,
  Hash,
  LifecycleBadge,
  Notice,
  PageHeading,
  Row,
  StatTile,
  buttonClass,
  inputClass,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import { REVOCATION_REASONS } from '@/lib/issuance/revoke';
import { can, requireRecordsSession } from '@/lib/records/access';
import { sanitiseSearch } from '@/lib/search';
import { createClient } from '@/lib/supabase/server';
import type { CredentialState } from '@/lib/types';

import { setCardStatusFromRecords } from '../actions';

export const metadata = { title: 'Cards · GBPUAT Smart Identity' };

const STATES: CredentialState[] = ['active', 'suspended', 'revoked', 'superseded', 'expired'];

type CredentialRow = {
  id: string;
  jti: string;
  issued_at: string | null;
  expires_at: string | null;
  people: { id: string; full_name: string | null; student_id: string | null } | null;
  credential_status: { status: CredentialState } | { status: CredentialState }[] | null;
};

function stateOf(row: CredentialRow): CredentialState | 'unknown' {
  const status = row.credential_status;
  if (!status) return 'unknown';
  return Array.isArray(status) ? (status[0]?.status ?? 'unknown') : status.status;
}

/**
 * The card register, and the one screen where a card is blocked.
 *
 * This is the revocation officer's whole job: a card reported lost is blocked
 * here, and the next scan of it at any gate or desk on campus is refused,
 * because every verifier reads credential_status live rather than trusting
 * what the card says about itself.
 */
export default async function RecordsCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string }>;
}) {
  const session = await requireRecordsSession('credentials.read');
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
       credential_status ( status )`,
    )
    .order('issued_at', { ascending: false })
    .limit(300);

  if (error) throw new Error(error.message);

  const all = (data ?? []) as unknown as CredentialRow[];
  const mayRevoke = can(session, 'credentials.revoke');
  const mayOpenStudent = can(session, 'students.read');

  const cards = all.filter((row) => {
    if (stateFilter && stateOf(row) !== stateFilter) return false;
    if (!search) return true;
    const haystack = `${row.people?.full_name ?? ''} ${row.people?.student_id ?? ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const active = all.filter((row) => stateOf(row) === 'active').length;
  const blocked = all.filter((row) => ['revoked', 'suspended'].includes(stateOf(row))).length;

  return (
    <>
      <PageHeading
        title="Cards"
        description="Every credential this university has signed. Blocking one stops it at the gate on the next scan."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Cards issued"
          value={all.length}
          icon={<IdCard size={17} />}
          tone="blue"
        />
        <StatTile label="Active" value={active} icon={<BadgeCheck size={17} />} tone="green" />
        <StatTile
          label="Blocked or suspended"
          value={blocked}
          icon={<Ban size={17} />}
          tone="red"
        />
      </div>

      {!mayRevoke ? (
        <div className="mb-6">
          <Notice tone="info" title="Read only">
            Your role can see cards but not change them. Blocking a card is the revocation
            officer&rsquo;s to do.
          </Notice>
        </div>
      ) : null}

      <Card
        title={search ? `Results for “${search}”` : 'All cards'}
        action={
          <form className="flex flex-wrap gap-2">
            <input
              name="q"
              defaultValue={search}
              placeholder="Name or student number"
              aria-label="Search cards"
              className={`${inputClass} w-52`}
            />
            <select
              name="state"
              defaultValue={stateFilter ?? ''}
              aria-label="Filter by status"
              className={inputClass}
            >
              <option value="">Any status</option>
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
          <EmptyState title="No cards found">
            Nothing matches that search. Cards are created by the card operator from a
            student&rsquo;s record.
          </EmptyState>
        ) : (
          <DataTable head={['Student', 'Credential', 'Issued', 'Expires', 'Status', '']}>
            {cards.map((row) => {
              const currentState = stateOf(row);
              const isBlocked = currentState === 'revoked' || currentState === 'suspended';

              return (
                <Row key={row.id}>
                  <td className="px-5 py-3">
                    {row.people && mayOpenStudent ? (
                      <Link
                        href={`/records/students/${row.people.id}`}
                        className="font-medium text-ink hover:text-brand-mid hover:underline"
                      >
                        {row.people.full_name ?? 'Unnamed'}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">
                        {row.people?.full_name ?? 'Unnamed'}
                      </span>
                    )}
                    <span className="block font-mono text-xs text-faint">
                      {row.people?.student_id ?? '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Hash>{row.jti}</Hash>
                  </td>
                  <td className="px-5 py-3 text-sm">
                    {row.issued_at ? formatDate(row.issued_at) : '—'}
                  </td>
                  <td className="px-5 py-3 text-sm">
                    {row.expires_at ? formatDate(row.expires_at) : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <LifecycleBadge state={currentState} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    {mayRevoke && currentState !== 'superseded' && currentState !== 'expired' ? (
                      <ActionForm
                        action={setCardStatusFromRecords}
                        submitLabel={isBlocked ? 'Reinstate' : 'Block card'}
                        pendingLabel="Saving…"
                        variant={isBlocked ? 'quiet' : 'danger'}
                        className="flex items-center justify-end gap-2"
                        hidden={{
                          credentialId: row.id,
                          targetStatus: isBlocked ? 'active' : 'revoked',
                        }}
                      >
                        <select
                          name="reasonCode"
                          aria-label="Reason"
                          defaultValue={isBlocked ? 'replaced' : 'lost'}
                          className={`${inputClass} w-36`}
                        >
                          {REVOCATION_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                              {reason.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </ActionForm>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </td>
                </Row>
              );
            })}
          </DataTable>
        )}
      </Card>
    </>
  );
}
