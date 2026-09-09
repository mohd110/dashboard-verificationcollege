import Link from 'next/link';

import { EventTable } from '@/components/event-table';
import { Card, Notice, PageHeading, StatTile } from '@/components/ui';
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
  const [students, locations, verificationsToday, eventsToday, recent] = await Promise.all([
    supabase
      .from('people')
      .select('id', { count: 'exact', head: true })
      .eq('person_type', 'student')
      .eq('status', 'active'),
    supabase
      .from('campus_locations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('campus_events')
      .select('id', { count: 'exact', head: true })
      .in('event_type', ['IDENTITY_VERIFIED', 'IDENTITY_REJECTED'])
      .gte('occurred_at', startOfToday),
    supabase
      .from('campus_events')
      .select('id', { count: 'exact', head: true })
      .gte('occurred_at', startOfToday),
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
        <StatTile label="Active Locations" value={locations.count ?? 0} note="Gates and libraries" />
        <StatTile
          label="Today's Verifications"
          value={verificationsToday.count ?? 0}
          note="Identity scans since midnight"
        />
        <StatTile
          label="Events Today"
          value={eventsToday.count ?? 0}
          note="All campus activity"
        />
      </div>

      <div className="mt-6">
        <Notice tone="info" title="Waiting on two subsystems">
          Card and credential figures arrive with the identity subsystem. Library transaction
          figures arrive with the library subsystem. Neither is invented here in the meantime.
        </Notice>
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
