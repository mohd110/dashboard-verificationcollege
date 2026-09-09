import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IdCard } from 'lucide-react';

import { ActionForm } from '@/components/action-form';
import { ActivityTrail } from '@/components/activity-trail';
import {
  Card,
  DataTable,
  EmptyState,
  Fact,
  LifecycleBadge,
  PageHeading,
  Row,
  SkeletonCard,
  StatusPill,
} from '@/components/ui';
import { listActivityTrail } from '@/lib/events';
import { formatDate } from '@/lib/format';
import { REASON_LABELS } from '@/lib/issuance/revoke';
import { requireAdminSession } from '@/lib/session';
import { getStudent, latestCard, listCredentials } from '@/lib/students';

import { issueCard } from '../../cards/actions';

export const metadata = { title: 'Student profile · GBPUAT Smart Identity' };

async function IdentityPanel({ personId }: { personId: string }) {
  const [card, credentials] = await Promise.all([latestCard(personId), listCredentials(personId)]);
  const current = credentials[0] ?? null;
  const superseded = credentials.slice(1);

  return (
    <>
      <Card title="Identity">
        <dl className="grid gap-4 px-5 py-5">
          <Fact label="Card">
            {card ? (
              <>
                <LifecycleBadge state={card.status} />
                <span className="mt-1 block text-xs text-muted">
                  Card {card.sequenceNo}
                  {card.issuedAt ? `, issued ${formatDate(card.issuedAt)}` : ''}
                </span>
              </>
            ) : (
              <span className="text-muted">No card has been made.</span>
            )}
          </Fact>

          <Fact label="Credential">
            {current ? (
              <>
                <LifecycleBadge state={current.state} />
                <span className="mt-1 block text-xs text-muted">
                  {current.reasonCode
                    ? `${REASON_LABELS[current.reasonCode as keyof typeof REASON_LABELS] ?? current.reasonCode}, `
                    : ''}
                  {current.changedAt ? formatDate(current.changedAt) : ''}
                </span>
                <Link
                  href={`/admin/cards/${current.id}`}
                  className="mt-1.5 inline-block text-xs font-medium text-brand-mid hover:underline"
                >
                  Open the card
                </Link>
              </>
            ) : (
              <span className="text-muted">No credential has been issued.</span>
            )}
          </Fact>

          {current?.expiresAt ? (
            <Fact label="Expires">{formatDate(current.expiresAt)}</Fact>
          ) : null}
        </dl>

        <div className="border-t border-line-soft px-5 py-4">
          <ActionForm
            action={issueCard}
            submitLabel={current ? 'Reissue card' : 'Issue card'}
            pendingLabel="Signing…"
            full
            hidden={{ personId }}
          />
          <p className="mt-2 text-xs text-faint">
            {current
              ? 'A reissue signs a new credential and increments the card number, so the older card is visibly stale at the gate. It does not block the old one.'
              : 'Signs an Ed25519 credential and prints a scannable card. Recorded on the activity trail.'}
          </p>
        </div>
      </Card>

      {superseded.length > 0 ? (
        <Card title={`${superseded.length} earlier ${superseded.length === 1 ? 'card' : 'cards'}`}>
          <DataTable compact head={['Issued', 'State', '']}>
            {superseded.map((credential) => (
              <Row key={credential.id}>
                <td className="px-5 py-2.5 text-sm whitespace-nowrap">
                  {credential.issuedAt ? formatDate(credential.issuedAt) : '—'}
                </td>
                <td className="px-5 py-2.5">
                  <LifecycleBadge state={credential.state} />
                </td>
                <td className="px-5 py-2.5 text-right">
                  <Link
                    href={`/admin/cards/${credential.id}`}
                    className="text-xs font-medium text-brand-mid hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </Row>
            ))}
          </DataTable>
        </Card>
      ) : null}
    </>
  );
}

async function Trail({ personId }: { personId: string }) {
  const events = await listActivityTrail(personId);

  return (
    <Card
      title="Activity Trail"
      description={`${events.length} ${events.length === 1 ? 'event' : 'events'}, oldest first`}
    >
      {events.length === 0 ? (
        <EmptyState title="Nothing recorded yet">
          This student has not been scanned at a gate, entered the library or been issued a card.
        </EmptyState>
      ) : (
        <ActivityTrail events={events} />
      )}
    </Card>
  );
}

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  await requireAdminSession();
  const { personId } = await params;

  // The register read is what decides whether this page exists at all, so it
  // is awaited here. Cards, credentials and the trail stream in behind it.
  const student = await getStudent(personId);
  if (!student) notFound();

  return (
    <>
      <PageHeading
        title={student.fullName}
        description={`Student number ${student.studentNumber ?? 'not assigned'}`}
        action={
          <Link
            href="/admin/cards"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-mid hover:underline"
          >
            <IdCard size={15} />
            All cards
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[21rem_1fr] lg:items-start">
        <div className="space-y-6">
          <Card title="Registration">
            <dl className="grid gap-4 px-5 py-5">
              <Fact label="Department">{student.department ?? '—'}</Fact>
              <Fact label="Programme">{student.programme ?? '—'}</Fact>
              <Fact label="Email">{student.email ?? '—'}</Fact>
              <Fact label="Register status">
                <StatusPill active={student.status === 'active'} />
              </Fact>
            </dl>
          </Card>

          <Suspense
            fallback={
              <Card title="Identity">
                <SkeletonCard lines={3} />
              </Card>
            }
          >
            <IdentityPanel personId={student.id} />
          </Suspense>
        </div>

        <Suspense
          fallback={
            <Card title="Activity Trail">
              <SkeletonCard lines={5} />
            </Card>
          }
        >
          <Trail personId={student.id} />
        </Suspense>
      </div>
    </>
  );
}
