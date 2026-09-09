import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { ActivityTrail } from '@/components/activity-trail';
import { Card, PageHeading, StatusPill } from '@/components/ui';
import { listActivityTrail } from '@/lib/events';
import { formatDate } from '@/lib/format';
import { requireAdminSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { CardStatus, CredentialState, PersonStatus } from '@/lib/types';

export const metadata = { title: 'Student profile · GBPUAT Smart Identity' };

type StudentProfile = {
  id: string;
  student_id: string | null;
  full_name: string;
  email: string | null;
  department: string | null;
  status: PersonStatus;
  enrolments: { programme: string | null; status: string; student_number: string | null }[] | null;
};

type CardRow = { status: CardStatus; sequence_no: number; issued_at: string | null };

type CredentialRow = {
  id: string;
  jti: string;
  issued_at: string | null;
  expires_at: string | null;
  credential_status: { status: CredentialState; changed_at: string; reason_code: string | null }[] | null;
};

/** Only 'active' is a good credential. Everything else is a reason to stop. */
const GOOD_CREDENTIAL: CredentialState = 'active';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  await requireAdminSession();
  const { personId } = await params;

  const supabase = await createClient();

  // Cards and credentials belong to the identity subsystem. They are read here
  // and never written, because issuing and revoking are its job, not this one.
  const [personResult, cardResult, credentialResult] = await Promise.all([
    supabase
      .from('people')
      .select(
        'id, student_id, full_name, email, department, status, enrolments ( programme, status, student_number )',
      )
      .eq('id', personId)
      .maybeSingle(),
    supabase
      .from('cards')
      .select('status, sequence_no, issued_at')
      .eq('person_id', personId)
      .order('sequence_no', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('credentials')
      .select('id, jti, issued_at, expires_at, credential_status ( status, changed_at, reason_code )')
      .eq('person_id', personId)
      .order('issued_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!personResult.data) notFound();

  const student = personResult.data as unknown as StudentProfile;
  const card = cardResult.data as CardRow | null;
  const credential = credentialResult.data as unknown as CredentialRow | null;
  const credentialState = credential?.credential_status?.[0] ?? null;
  const enrolment = student.enrolments?.[0];

  const trail = await listActivityTrail(student.id);

  return (
    <>
      <PageHeading
        title={student.full_name}
        description={`Student ID ${student.student_id ?? 'not assigned'}`}
      />

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
        <div className="space-y-6">
          <Card title="Registration">
            <dl className="grid gap-4 px-5 py-5">
              <Field label="Department">{student.department ?? '—'}</Field>
              <Field label="Programme">{enrolment?.programme ?? '—'}</Field>
              <Field label="Enrolment">{enrolment?.status ?? '—'}</Field>
              <Field label="Email">{student.email ?? '—'}</Field>
              <Field label="Register status">
                <StatusPill active={student.status === 'active'} />
              </Field>
            </dl>
          </Card>

          <Card title="Identity">
            <dl className="grid gap-4 px-5 py-5">
              <Field label="Card status">
                {card ? (
                  <>
                    <span className="font-medium uppercase">{card.status}</span>
                    <span className="block text-xs text-muted">
                      Card {card.sequence_no}
                      {card.issued_at ? `, issued ${formatDate(card.issued_at)}` : ''}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">No card has been made</span>
                )}
              </Field>

              <Field label="Credential status">
                {credentialState ? (
                  <>
                    <span
                      className={`font-semibold uppercase ${
                        credentialState.status === GOOD_CREDENTIAL ? 'text-ok' : 'text-bad'
                      }`}
                    >
                      {credentialState.status}
                    </span>
                    <span className="block text-xs text-muted">
                      Changed {formatDate(credentialState.changed_at)}
                      {credentialState.reason_code ? `, ${credentialState.reason_code}` : ''}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">No credential has been issued</span>
                )}
              </Field>

              {credential ? (
                <Field label="Credential expires">
                  {credential.expires_at ? formatDate(credential.expires_at) : '—'}
                </Field>
              ) : null}
            </dl>
          </Card>
        </div>

        <Card title={`Activity Trail · ${trail.length} ${trail.length === 1 ? 'event' : 'events'}`}>
          <ActivityTrail events={trail} />
        </Card>
      </div>
    </>
  );
}
