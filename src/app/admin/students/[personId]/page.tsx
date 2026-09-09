import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { ActivityTrail } from '@/components/activity-trail';
import { Card, Notice, PageHeading, StatusPill } from '@/components/ui';
import { listActivityTrail } from '@/lib/events';
import { requireAdminSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Student profile · GBPUAT Smart Identity' };

type StudentProfile = {
  id: string;
  person_code: string;
  full_name: string;
  email: string | null;
  status: 'active' | 'inactive';
  departments: { name: string } | null;
  enrolments: { programme: string; academic_year: string }[] | null;
};

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
  const { data } = await supabase
    .from('people')
    .select(
      'id, person_code, full_name, email, status, departments ( name ), enrolments ( programme, academic_year )',
    )
    .eq('id', personId)
    .maybeSingle();

  if (!data) notFound();

  const student = data as unknown as StudentProfile;
  const enrolment = student.enrolments?.[0];
  const trail = await listActivityTrail(student.id);

  return (
    <>
      <PageHeading title={student.full_name} description={`Student ID ${student.person_code}`} />

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
        <div className="space-y-6">
          <Card title="Registration">
            <dl className="grid gap-4 px-5 py-5">
              <Field label="Department">{student.departments?.name ?? '—'}</Field>
              <Field label="Programme">{enrolment?.programme ?? '—'}</Field>
              <Field label="Academic year">{enrolment?.academic_year ?? '—'}</Field>
              <Field label="Email">{student.email ?? '—'}</Field>
              <Field label="Register status">
                <StatusPill active={student.status === 'active'} />
              </Field>
            </dl>
          </Card>

          <Card title="Identity">
            <div className="px-5 py-5">
              <Notice tone="warn" title="Not connected">
                Card status and credential status come from the identity subsystem, which owns
                card issue and revocation. Until it is connected, this panel shows nothing rather
                than guessing.
              </Notice>
            </div>
          </Card>
        </div>

        <Card title={`Activity Trail · ${trail.length} ${trail.length === 1 ? 'event' : 'events'}`}>
          <ActivityTrail events={trail} />
        </Card>
      </div>
    </>
  );
}
