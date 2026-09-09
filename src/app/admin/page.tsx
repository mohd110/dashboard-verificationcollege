import Link from 'next/link';

import { EventTable } from '@/components/event-table';
import { Card, PageHeading, StatTile } from '@/components/ui';
import { listCampusEvents } from '@/lib/events';
import { campusToday } from '@/lib/format';
import { requireAdminSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Dashboard · GBPUAT Smart Identity' };

export default async function AdminDashboard() {
  const session = await requireAdminSession();
  const supabase = await createClient();
  const today = campusToday();
  const startOfToday = `${today}T00:00:00`;

  // Counts come back as headers rather than rows, so nothing is fetched twice.
  const [students, activeCards, verificationsToday, libraryTransactions, recent] = await Promise.all([
    supabase
      .from('people')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .eq('status', 'active'),
    supabase
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .in('status', ['issued', 'collected']),
    supabase
      .from('campus_events')
      .select('id', { count: 'exact', head: true })
      .in('event_type', ['IDENTITY_VERIFIED', 'IDENTITY_REJECTED'])
      .gte('occurred_at', startOfToday),
    supabase.from('book_transactions').select('id', { count: 'exact', head: true }),
    listCampusEvents({ limit: 10 }),
  ]);

  return (
    <>
      <PageHeading
        title="Dashboard"
        description={`Live figures for ${session.universityName}.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Students" value={students.count ?? 0} note="Active on the register" />
        <StatTile
          label="Active Cards"
          value={activeCards.count ?? 0}
          note="Issued or collected"
        />
        <StatTile
          label="Today's Verifications"
          value={verificationsToday.count ?? 0}
          note="Identity scans since midnight"
        />
        <StatTile
          label="Library Transactions"
          value={libraryTransactions.count ?? 0}
          note="Issues and returns, all time"
        />
      </div>

      <div className="mt-6">
        <Card
          title="Recent Activity"
          action={
            <Link href="/admin/activity" className="text-sm text-brand hover:underline">
              View all
            </Link>
          }
        >
          <EventTable events={recent} />
        </Card>
      </div>
    </>
  );
}
