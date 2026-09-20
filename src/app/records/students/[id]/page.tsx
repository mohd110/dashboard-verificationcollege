import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ActionForm } from '@/components/action-form';
import { ActivityTrail } from '@/components/activity-trail';
import {
  Card,
  Fact,
  LifecycleBadge,
  Notice,
  PageHeading,
  SkeletonCard,
  StatusPill,
} from '@/components/ui';
import { listCampusEventsForUniversity } from '@/lib/events';
import { can, requireRecordsSession } from '@/lib/records/access';
import { getStudent, latestCard, listCredentials } from '@/lib/students';
import type { StaffSession } from '@/lib/session';

import { issueCardFromRecords } from '../../actions';

export const metadata = { title: 'Student Record · GBPUAT Smart Identity' };

/**
 * One student, as the records office sees them.
 *
 * The three sections answer the three questions the office is asked: who is
 * this, what card do they hold, and what have they done on campus. Each is
 * rendered only for a role permitted to see it, so a registrar gets the
 * register and the history without the credentials they may not read.
 */

async function Cards({ personId, session }: { personId: string; session: StaffSession }) {
  const [credentials, card] = await Promise.all([listCredentials(personId), latestCard(personId)]);
  const active = credentials.find((credential) => credential.state === 'active');

  return (
    <div className="space-y-4">
      {card ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Fact label="Latest card">#{card.sequenceNo}</Fact>
          <Fact label="Card status">{card.status}</Fact>
        </div>
      ) : (
        <p className="text-sm text-muted">No card has been printed for this student yet.</p>
      )}

      {credentials.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line">
          {credentials.map((credential) => (
            <li key={credential.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-ink">{credential.jti}</p>
                <p className="text-xs text-faint">
                  {credential.issuedAt
                    ? `Issued ${new Date(credential.issuedAt).toLocaleDateString('en-GB')}`
                    : 'Not yet issued'}
                  {credential.reasonCode ? ` · ${credential.reasonCode}` : ''}
                </p>
              </div>
              <LifecycleBadge state={credential.state} />
            </li>
          ))}
        </ul>
      ) : null}

      {can(session, 'credentials.issue') ? (
        <div className="border-t border-line pt-4">
          <ActionForm
            action={issueCardFromRecords}
            submitLabel={active ? 'Re-issue card' : 'Issue card'}
            pendingLabel="Signing…"
            hidden={{ personId }}
          >
            <p className="mb-3 text-sm text-muted">
              {active
                ? 'Re-issuing supersedes the current credential. The old QR stops verifying.'
                : 'Signs a new credential with the university key and records it on the trail.'}
            </p>
          </ActionForm>
        </div>
      ) : null}

      {can(session, 'credentials.revoke') ? (
        <p className="border-t border-line pt-4 text-sm text-muted">
          Cards are blocked from the{' '}
          <Link href="/records/cards" className="font-medium text-brand-mid hover:underline">
            Cards screen
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

async function Trail({ personId, universityId }: { personId: string; universityId: string }) {
  const events = await listCampusEventsForUniversity(universityId, { personId, limit: 200 });
  // The trail reads oldest first; the query returns newest first.
  return <ActivityTrail events={[...events].reverse()} />;
}

export default async function RecordsStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ issued?: string }>;
}) {
  const session = await requireRecordsSession('students.read');
  const { id } = await params;
  const { issued } = await searchParams;

  const student = await getStudent(id);
  if (!student) notFound();

  return (
    <>
      <Link
        href="/records"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand-mid"
      >
        <ArrowLeft size={15} />
        All students
      </Link>

      <PageHeading
        title={student.fullName}
        description={`${student.studentNumber ?? 'No student number'} · ${
          student.department ?? 'No department'
        }`}
      />

      {issued ? (
        <div className="mb-6">
          <Notice tone="ok" title="Card issued">
            The credential has been signed and recorded on this student&rsquo;s activity trail. It
            will verify at the gate and the library desk immediately.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-6">
          <Card title="Identity" padded>
            <div className="grid gap-4 sm:grid-cols-2">
              <Fact label="Full name">{student.fullName}</Fact>
              <Fact label="Student number">{student.studentNumber ?? '—'}</Fact>
              <Fact label="Department">{student.department ?? '—'}</Fact>
              <Fact label="Programme">{student.programme ?? '—'}</Fact>
              <Fact label="Email">{student.email ?? '—'}</Fact>
              <Fact label="Status">
                <StatusPill active={student.status === 'active'} />
              </Fact>
            </div>
          </Card>

          {can(session, 'activity.read') ? (
            <Card
              title="Campus activity"
              description="Every gate check, library visit and card event for this student"
            >
              <Suspense fallback={<SkeletonCard lines={6} />}>
                <Trail personId={id} universityId={session.universityId} />
              </Suspense>
            </Card>
          ) : null}
        </div>

        {can(session, 'credentials.read') ? (
          <Card title="Cards and credentials" padded>
            <Suspense fallback={<SkeletonCard lines={4} />}>
              <Cards personId={id} session={session} />
            </Suspense>
          </Card>
        ) : (
          <Card title="Cards and credentials" padded>
            <p className="text-sm text-muted">
              Your role does not include access to credentials. The card operator and the
              revocation officer work these.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
