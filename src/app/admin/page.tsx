import { Suspense } from 'react';
import Link from 'next/link';
import { BookOpen, IdCard, ScanLine, Users } from 'lucide-react';

import { EventTable } from '@/components/event-table';
import { Card, PageHeading, SkeletonStats, SkeletonTable, StatTile } from '@/components/ui';
import { listCampusEvents } from '@/lib/events';
import { campusToday } from '@/lib/format';
import { requireAdminSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Dashboard · GBPUAT Smart Identity' };

/**
 * The two halves of this page are fetched independently and streamed.
 *
 * The counters are four header-only queries and come back quickly; the recent
 * activity list joins four tables and does not. Wrapping each in its own
 * boundary means the figures appear as soon as they are ready instead of
 * waiting for the slowest query on the screen.
 */

async function Counters() {
  const today = campusToday();
  const supabase = await createClient();

  // Counts come back as headers rather than rows, so nothing is fetched twice.
  const [students, activeCards, verificationsToday, libraryTransactions] = await Promise.all([
    supabase
      .from('people')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .eq('status', 'active'),
    supabase
      .from('credential_status')
      .select('credential_id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('campus_events')
      .select('id', { count: 'exact', head: true })
      .in('event_type', ['IDENTITY_VERIFIED', 'IDENTITY_REJECTED'])
      .gte('occurred_at', `${today}T00:00:00`),
    supabase.from('book_transactions').select('id', { count: 'exact', head: true }),
  ]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Students"
        value={students.count ?? 0}
        note="Active on the register"
        tone="blue"
        icon={<Users size={17} />}
      />
      <StatTile
        label="Active Cards"
        value={activeCards.count ?? 0}
        note="Credentials that verify"
        tone="green"
        icon={<IdCard size={17} />}
      />
      <StatTile
        label="Today's Verifications"
        value={verificationsToday.count ?? 0}
        note="Identity scans since midnight"
        tone="amber"
        icon={<ScanLine size={17} />}
      />
      <StatTile
        label="Library Transactions"
        value={libraryTransactions.count ?? 0}
        note="Issues and returns, all time"
        tone="grey"
        icon={<BookOpen size={17} />}
      />
    </div>
  );
}

async function RecentActivity() {
  const events = await listCampusEvents({ limit: 10 });
  return <EventTable events={events} />;
}

export default async function AdminDashboard() {
  const session = await requireAdminSession();

  return (
    <>
      <PageHeading title="Dashboard" description={`Live figures for ${session.universityName}.`} />

      <Suspense fallback={<SkeletonStats />}>
        <Counters />
      </Suspense>

      <div className="mt-6">
        <Card
          title="Recent Activity"
          description="The last ten campus events, whoever recorded them"
          action={
            <Link
              href="/admin/activity"
              className="text-sm font-medium text-brand-mid hover:underline"
            >
              View all
            </Link>
          }
        >
          <Suspense fallback={<SkeletonTable rows={5} columns={6} />}>
            <RecentActivity />
          </Suspense>
        </Card>
      </div>
    </>
  );
}
