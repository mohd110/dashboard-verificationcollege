import { redirect } from 'next/navigation';

import { GuardApp, type GuardStats } from '@/components/guard/GuardApp';
import type { ClearanceItem } from '@/components/guard/GuardHomeView';
import { listCampusEvents } from '@/lib/events';
import { getStaffSession, homePathFor } from '@/lib/session';
import { FAILED_RESULTS } from '@/lib/types';

export const metadata = { title: 'Gate Verifier · GBPUAT Smart Identity' };

/** Roles that stand at a gate. */
const GATE_ROLES = ['guard', 'verifier', 'university_admin', 'platform_admin'];

/** Duty lanes. A lane is a label on an event, not a place in the database. */
const LANES = ['Lane A', 'Lane B', 'Lane C'];

/**
 * The gate application's one server entry point.
 *
 * Everything the screens used to invent — the officer, the gate, the feed of
 * recent clearances and the day's counters — is read here from the same
 * campus_events table the admin dashboard reads, and handed down as props.
 */
export default async function GuardPage() {
  const session = await getStaffSession();
  if (!session) redirect('/login?next=/guard');
  if (session.status !== 'active') redirect('/no-access?reason=deactivated');
  if (!GATE_ROLES.includes(session.role)) redirect(homePathFor(session));

  if (!session.posting) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '32px',
          background: '#f8f9ff',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: '420px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0E294B', margin: '0 0 8px' }}>
            No gate assigned
          </h1>
          <p style={{ fontSize: '13px', color: '#5b6472', lineHeight: 1.6, margin: 0 }}>
            You have not been posted to a gate, so a scan would have nowhere to be recorded. An
            administrator can assign you a location on the Users screen.
          </p>
        </div>
      </main>
    );
  }

  const posting = session.posting;
  const recent = await listCampusEvents({ locationId: posting.id, limit: 25 });

  const feed: ClearanceItem[] = recent.map((event) => {
    const denied = FAILED_RESULTS.includes(event.result);
    const metadata = (event.metadata ?? {}) as { reason?: string; desk?: string };

    return {
      id: event.id,
      name: event.person?.fullName ?? 'Unidentified card',
      studentId: event.person?.personCode ?? '—',
      time: new Date(event.occurredAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      }),
      dept: '—',
      lane: posting.name,
      status: denied ? 'DENIED' : 'VERIFIED',
      reason: metadata.reason,
    };
  });

  const approved = feed.filter((item) => item.status === 'VERIFIED').length;
  const denied = feed.length - approved;

  const stats: GuardStats = {
    totalScans: feed.length,
    approved,
    denied,
    activeRate: feed.length ? `${((approved / feed.length) * 100).toFixed(1)}%` : '—',
    lastScannedAgo: recent[0]
      ? new Date(recent[0].occurredAt).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        })
      : '—',
  };

  // A shield number is a property of the guard force, which this database does
  // not model. The staff record's own short id stands in, so the badge on
  // screen refers to something real rather than to an invented number.
  const shield = `#${session.userId.slice(0, 4).toUpperCase()}`;

  return (
    <GuardApp
      officerName={session.fullName}
      officerShield={shield}
      gateName={posting.name}
      lanes={LANES}
      initialLane={LANES[0]}
      initialFeed={feed}
      initialStats={stats}
    />
  );
}
