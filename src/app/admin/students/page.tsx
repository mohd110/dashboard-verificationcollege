import Link from 'next/link';

import { Card, DataTable, EmptyState, PageHeading, StatusPill } from '@/components/ui';
import { sanitiseSearch } from '@/lib/search';
import { requireAdminSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Students · GBPUAT Smart Identity' };

type StudentRow = {
  id: string;
  person_code: string;
  full_name: string;
  status: 'active' | 'inactive';
  departments: { name: string } | null;
  enrolments: { programme: string; academic_year: string }[] | null;
};

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminSession();
  const { q } = await searchParams;
  const search = sanitiseSearch(q ?? '');

  const supabase = await createClient();
  let query = supabase
    .from('people')
    .select('id, person_code, full_name, status, departments ( name ), enrolments ( programme, academic_year )')
    .eq('person_type', 'student')
    .order('full_name')
    .limit(200);

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,person_code.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const students = (data ?? []) as unknown as StudentRow[];

  return (
    <>
      <PageHeading title="Students" description="The student register for this campus." />

      <Card
        title={`${students.length} ${students.length === 1 ? 'student' : 'students'}`}
        action={
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={search}
              placeholder="Name or student ID"
              aria-label="Search students"
              className="rounded-md border border-line px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Search
            </button>
          </form>
        }
      >
        {students.length === 0 ? (
          <EmptyState>
            {search ? `Nobody matches "${search}".` : 'The register is empty.'}
          </EmptyState>
        ) : (
          <DataTable head={['Student', 'Student ID', 'Department', 'Programme', 'Status', '']}>
            {students.map((student) => (
              <tr key={student.id} className="hover:bg-canvas">
                <td className="px-5 py-3 font-medium">{student.full_name}</td>
                <td className="px-5 py-3 font-mono text-xs tabular-nums">{student.person_code}</td>
                <td className="px-5 py-3">{student.departments?.name ?? '—'}</td>
                <td className="px-5 py-3">{student.enrolments?.[0]?.programme ?? '—'}</td>
                <td className="px-5 py-3">
                  <StatusPill active={student.status === 'active'} />
                </td>
                <td className="px-5 py-3 text-right">
                  <Link
                    href={`/admin/students/${student.id}`}
                    className="text-sm text-brand hover:underline"
                  >
                    Open profile
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
