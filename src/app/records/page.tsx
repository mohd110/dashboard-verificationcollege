import { Suspense } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';

import {
  Card,
  DataTable,
  EmptyState,
  PageHeading,
  Row,
  SkeletonTable,
  StatusPill,
  buttonClass,
  inputClass,
} from '@/components/ui';
import { recordsHomeFor, requireRecordsSession } from '@/lib/records/access';
import { sanitiseSearch } from '@/lib/search';
import { listStudents } from '@/lib/students';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Student Records · GBPUAT Smart Identity' };

async function StudentTable({ search }: { search: string }) {
  const students = await listStudents(search);

  if (students.length === 0) {
    return (
      <EmptyState title="Nobody found">
        {search ? `Nothing on the register matches “${search}”.` : 'The register is empty.'}
      </EmptyState>
    );
  }

  return (
    <DataTable head={['Student', 'Student number', 'Department', 'Programme', 'Status', '']}>
      {students.map((student) => (
        <Row key={student.id}>
          <td className="px-5 py-3">
            <Link
              href={`/records/students/${student.id}`}
              className="font-medium text-ink hover:text-brand-mid hover:underline"
            >
              {student.fullName}
            </Link>
            {student.email ? (
              <span className="block truncate text-xs text-faint">{student.email}</span>
            ) : null}
          </td>
          <td className="px-5 py-3 font-mono text-xs tabular-nums">
            {student.studentNumber ?? '—'}
          </td>
          <td className="px-5 py-3">{student.department ?? '—'}</td>
          <td className="px-5 py-3">{student.programme ?? '—'}</td>
          <td className="px-5 py-3">
            <StatusPill active={student.status === 'active'} />
          </td>
          <td className="px-5 py-3 text-right">
            <Link
              href={`/records/students/${student.id}`}
              className="text-sm font-medium text-brand-mid hover:underline"
            >
              Open record
            </Link>
          </td>
        </Row>
      ))}
    </DataTable>
  );
}

export default async function RecordsStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireRecordsSession();

  // A revocation officer may block a card without being able to read the
  // register it belongs to. That is the database's split, not this screen's,
  // so they are sent to the one they can work rather than shown an empty page.
  const home = recordsHomeFor(session);
  if (home !== '/records') redirect(home);

  const { q } = await searchParams;
  const search = sanitiseSearch(q ?? '');

  return (
    <>
      <PageHeading
        title="Student Records"
        description="The student register for this campus. Open anyone to see their card and their full campus history."
      />

      <Card
        title={search ? `Results for “${search}”` : 'All students'}
        action={
          <form className="flex gap-2">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
              />
              <input
                name="q"
                defaultValue={search}
                placeholder="Name or student number"
                aria-label="Search students"
                className={`${inputClass} w-56 pl-9`}
              />
            </div>
            <button type="submit" className={buttonClass.secondary}>
              Search
            </button>
          </form>
        }
      >
        <Suspense key={search} fallback={<SkeletonTable rows={8} columns={6} />}>
          <StudentTable search={search} />
        </Suspense>
      </Card>
    </>
  );
}
