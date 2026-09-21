import 'server-only';

import { campusToday, formatTime } from '@/lib/format';
import type { StaffSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

/**
 * Fests and campus events.
 *
 * The thing to understand before reading this file: attendance is not stored
 * anywhere in it. Each fest owns a campus location, guards on fest duty record
 * their scans there through record_campus_event, and so "who came, and when"
 * is read out of campus_events — the hash-chained record — rather than out of a
 * table anybody could edit. What is stored is the decision on top of it: was
 * this student's class attendance regularised for that day.
 */

export type FestCategory =
  | 'cultural'
  | 'technical'
  | 'sports'
  | 'academic'
  | 'agricultural'
  | 'other';

export const FEST_CATEGORIES: Array<{ value: FestCategory; label: string }> = [
  { value: 'cultural', label: 'Cultural' },
  { value: 'technical', label: 'Technical' },
  { value: 'sports', label: 'Sports' },
  { value: 'academic', label: 'Academic' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'other', label: 'Other' },
];

export type FestPhase = 'upcoming' | 'live' | 'ended' | 'cancelled';

export type Fest = {
  id: string;
  locationId: string;
  name: string;
  category: FestCategory;
  description: string | null;
  venue: string | null;
  startsAt: string;
  endsAt: string;
  regulariseAttendance: boolean;
  cancelledAt: string | null;
  createdAt: string;
};

type FestRow = {
  id: string;
  location_id: string;
  name: string;
  category: FestCategory;
  description: string | null;
  venue: string | null;
  starts_at: string;
  ends_at: string;
  regularise_attendance: boolean;
  cancelled_at: string | null;
  created_at: string;
};

const FEST_COLUMNS =
  'id, location_id, name, category, description, venue, starts_at, ends_at, regularise_attendance, cancelled_at, created_at';

function toFest(row: FestRow): Fest {
  return {
    id: row.id,
    locationId: row.location_id,
    name: row.name,
    category: row.category,
    description: row.description,
    venue: row.venue,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    regulariseAttendance: row.regularise_attendance,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  };
}

export function phaseOf(fest: Pick<Fest, 'startsAt' | 'endsAt' | 'cancelledAt'>, now = new Date()): FestPhase {
  if (fest.cancelledAt) return 'cancelled';
  if (now < new Date(fest.startsAt)) return 'upcoming';
  if (now < new Date(fest.endsAt)) return 'live';
  return 'ended';
}

/**
 * True when the fest tables have not been created yet.
 *
 * Migration 0109 is applied by hand in the Supabase SQL editor, so there is a
 * window where this code is deployed and the tables are not. PostgREST names
 * the missing table in its error; recognising that turns a stack trace into a
 * screen that says which file to run.
 */
export function isMissingFestTables(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the table|does not exist|schema cache/i.test(error.message ?? '')
  );
}

export class FestTablesMissing extends Error {
  constructor() {
    super('The fest tables do not exist yet. Apply migration 0109 in the Supabase SQL editor.');
    this.name = 'FestTablesMissing';
  }
}

/* ── Campus time ──────────────────────────────────────────────────────── */

/**
 * A datetime-local value, read as campus time.
 *
 * The browser sends "2026-09-21T10:00" with no zone at all. A Vercel function
 * runs in UTC, so parsing that naively would put a 10 a.m. opening at 3.30
 * p.m. in Pantnagar. The campus is in one place, so its offset is fixed here.
 */
export function parseCampusDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The inverse, for filling a datetime-local input with a stored instant. */
export function toCampusInput(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 330 * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** Every campus calendar day the fest touches, as yyyy-mm-dd. */
export function festDays(fest: Pick<Fest, 'startsAt' | 'endsAt'>): string[] {
  const days: string[] = [];
  const last = campusToday(new Date(new Date(fest.endsAt).getTime() - 1));
  let cursor = new Date(fest.startsAt);

  // Bounded, so a mistyped year cannot make a page loop for ever.
  for (let guard = 0; guard < 60; guard += 1) {
    const day = campusToday(cursor);
    days.push(day);
    if (day >= last) break;
    cursor = new Date(cursor.getTime() + 86_400_000);
  }

  return [...new Set(days)];
}

/* ── Reading ──────────────────────────────────────────────────────────── */

export async function listFests(): Promise<Fest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('campus_fests')
    .select(FEST_COLUMNS)
    .order('starts_at', { ascending: false })
    .limit(200);

  if (isMissingFestTables(error)) throw new FestTablesMissing();
  if (error) throw new Error(error.message);
  return (data as FestRow[]).map(toFest);
}

export async function getFest(festId: string): Promise<Fest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('campus_fests')
    .select(FEST_COLUMNS)
    .eq('id', festId)
    .maybeSingle();

  if (isMissingFestTables(error)) throw new FestTablesMissing();
  if (error) throw new Error(error.message);
  return data ? toFest(data as FestRow) : null;
}

export type Coordinator = {
  id: string;
  fullName: string;
  designation: string;
  kind: 'faculty' | 'student' | 'staff' | 'volunteer';
  phone: string | null;
  email: string | null;
  personId: string | null;
};

export async function listCoordinators(festId: string): Promise<Coordinator[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fest_coordinators')
    .select('id, full_name, designation, kind, phone, email, person_id')
    .eq('fest_id', festId)
    .order('created_at');

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    designation: row.designation,
    kind: row.kind,
    phone: row.phone,
    email: row.email,
    personId: row.person_id,
  }));
}

export type GuardDuty = {
  id: string;
  guardUserId: string;
  guardName: string;
  post: string;
  shiftStartsAt: string;
  shiftEndsAt: string;
};

export async function listDuties(festId: string): Promise<GuardDuty[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fest_guard_duties')
    // Named explicitly: this table points at app_users twice — the guard, and
    // whoever rostered them — and PostgREST refuses to guess which is meant.
    .select(
      'id, guard_user_id, post, shift_starts_at, shift_ends_at, guard:app_users!guard_user_id ( display_name )',
    )
    .eq('fest_id', festId)
    .order('shift_starts_at');

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Array<{
    id: string;
    guard_user_id: string;
    post: string;
    shift_starts_at: string;
    shift_ends_at: string;
    guard: { display_name: string } | null;
  }>).map((row) => ({
    id: row.id,
    guardUserId: row.guard_user_id,
    guardName: row.guard?.display_name ?? 'Unknown guard',
    post: row.post,
    shiftStartsAt: row.shift_starts_at,
    shiftEndsAt: row.shift_ends_at,
  }));
}

/** Staff who can be put on a gate: anybody holding the guard role. */
export async function listGuardStaff(): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id, app_users ( id, display_name, status )')
    .eq('role', 'guard');

  if (error) throw new Error(error.message);

  const seen = new Map<string, string>();
  for (const row of (data ?? []) as unknown as Array<{
    user_id: string;
    app_users: { id: string; display_name: string; status: string } | null;
  }>) {
    if (row.app_users && row.app_users.status === 'active') {
      seen.set(row.app_users.id, row.app_users.display_name);
    }
  }

  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ── Attendance and regularisation ────────────────────────────────────── */

export type AttendanceStatus = 'pending' | 'approved' | 'rejected';
export type RegularisationBasis = 'scanned' | 'on_duty' | 'manual';

export type AttendanceRow = {
  personId: string;
  fullName: string;
  studentNumber: string | null;
  department: string | null;
  day: string;
  /** Null for somebody on the list without ever passing a gate. */
  firstSeen: string | null;
  scans: number;
  status: AttendanceStatus;
  basis: RegularisationBasis;
  note: string | null;
};

export type AttendanceSummary = {
  rows: AttendanceRow[];
  uniqueAttendees: number;
  scansTotal: number;
  byDay: Record<string, { attendees: number; pending: number; approved: number; rejected: number }>;
};

/**
 * The roster: everybody seen at the fest, plus everybody added on duty, with
 * the regularisation decision for each student and day.
 *
 * Seen means a VALID identity check at the fest's own location. A rejected
 * scan is not attendance — a blocked card at the gate is a student who was
 * turned away.
 */
export async function getAttendance(fest: Fest): Promise<AttendanceSummary> {
  const supabase = await createClient();

  const [eventsResult, decisionsResult] = await Promise.all([
    supabase
      .from('campus_events')
      .select('person_id, occurred_at')
      .eq('location_id', fest.locationId)
      .eq('event_type', 'IDENTITY_VERIFIED')
      .eq('result', 'VALID')
      .not('person_id', 'is', null)
      .order('occurred_at')
      .limit(5000),
    supabase
      .from('fest_regularisations')
      .select('person_id, attended_on, status, basis, note')
      .eq('fest_id', fest.id),
  ]);

  if (eventsResult.error) throw new Error(eventsResult.error.message);
  if (decisionsResult.error) throw new Error(decisionsResult.error.message);

  type Key = string;
  const key = (personId: string, day: string): Key => `${personId}|${day}`;

  const seen = new Map<Key, { firstSeen: string; scans: number }>();
  for (const event of eventsResult.data ?? []) {
    const day = campusToday(new Date(event.occurred_at));
    const k = key(event.person_id as string, day);
    const entry = seen.get(k);
    if (entry) entry.scans += 1;
    else seen.set(k, { firstSeen: event.occurred_at, scans: 1 });
  }

  const decisions = new Map<
    Key,
    { status: 'approved' | 'rejected'; basis: RegularisationBasis; note: string | null }
  >();
  for (const row of decisionsResult.data ?? []) {
    decisions.set(key(row.person_id, row.attended_on), {
      status: row.status,
      basis: row.basis,
      note: row.note,
    });
  }

  const keys = new Set<Key>([...seen.keys(), ...decisions.keys()]);
  const personIds = [...new Set([...keys].map((k) => k.split('|')[0]))];

  const people = new Map<string, { fullName: string; studentNumber: string | null; department: string | null }>();
  if (personIds.length > 0) {
    const { data } = await supabase
      .from('people')
      .select('id, full_name, student_id, department')
      .in('id', personIds);

    for (const person of data ?? []) {
      people.set(person.id, {
        fullName: person.full_name ?? 'Unnamed',
        studentNumber: person.student_id,
        department: person.department,
      });
    }
  }

  const rows: AttendanceRow[] = [...keys].map((k) => {
    const [personId, day] = k.split('|');
    const scan = seen.get(k);
    const decision = decisions.get(k);
    const person = people.get(personId);

    return {
      personId,
      fullName: person?.fullName ?? 'Unknown student',
      studentNumber: person?.studentNumber ?? null,
      department: person?.department ?? null,
      day,
      firstSeen: scan?.firstSeen ?? null,
      scans: scan?.scans ?? 0,
      status: decision?.status ?? 'pending',
      basis: decision?.basis ?? 'scanned',
      note: decision?.note ?? null,
    };
  });

  rows.sort((a, b) => (a.day === b.day ? a.fullName.localeCompare(b.fullName) : a.day < b.day ? -1 : 1));

  const byDay: AttendanceSummary['byDay'] = {};
  for (const row of rows) {
    const bucket = (byDay[row.day] ??= { attendees: 0, pending: 0, approved: 0, rejected: 0 });
    bucket.attendees += 1;
    bucket[row.status] += 1;
  }

  return {
    rows,
    uniqueAttendees: personIds.length,
    scansTotal: eventsResult.data?.length ?? 0,
    byDay,
  };
}

/* ── The guard's side ─────────────────────────────────────────────────── */

export type ActiveDuty = {
  dutyId: string;
  festId: string;
  festName: string;
  locationId: string;
  locationName: string;
  venue: string | null;
  post: string;
  shiftEndsAt: string;
  coordinators: Array<{ name: string; designation: string; phone: string | null }>;
};

/**
 * The fest shift this guard is working right now, if any.
 *
 * Read with the guard's own session: the duties policy shows a guard their own
 * rows and nobody else's. A missing table, a cancelled fest or a location that
 * has been retired all mean "no duty", and the gate carries on at the guard's
 * ordinary posting.
 */
export async function getActiveDuty(session: StaffSession): Promise<ActiveDuty | null> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('fest_guard_duties')
    .select(
      `id, post, shift_ends_at,
       campus_fests ( id, name, venue, location_id, cancelled_at,
                      campus_locations ( name, status ) )`,
    )
    .eq('guard_user_id', session.userId)
    .lte('shift_starts_at', now)
    .gt('shift_ends_at', now)
    .order('shift_starts_at', { ascending: false })
    .limit(5);

  if (error) return null;

  const duty = ((data ?? []) as unknown as Array<{
    id: string;
    post: string;
    shift_ends_at: string;
    campus_fests: {
      id: string;
      name: string;
      venue: string | null;
      location_id: string;
      cancelled_at: string | null;
      campus_locations: { name: string; status: string } | null;
    } | null;
  }>).find(
    (row) =>
      row.campus_fests &&
      !row.campus_fests.cancelled_at &&
      row.campus_fests.campus_locations?.status === 'active',
  );

  if (!duty || !duty.campus_fests) return null;

  const { data: coordinators } = await supabase
    .from('fest_coordinators')
    .select('full_name, designation, phone')
    .eq('fest_id', duty.campus_fests.id)
    .order('created_at')
    .limit(6);

  return {
    dutyId: duty.id,
    festId: duty.campus_fests.id,
    festName: duty.campus_fests.name,
    locationId: duty.campus_fests.location_id,
    locationName: duty.campus_fests.campus_locations?.name ?? duty.campus_fests.name,
    venue: duty.campus_fests.venue,
    post: duty.post,
    shiftEndsAt: duty.shift_ends_at,
    coordinators: (coordinators ?? []).map((row) => ({
      name: row.full_name,
      designation: row.designation,
      phone: row.phone,
    })),
  };
}

/** "until 18:00", for the duty banner. */
export function shiftEndLabel(duty: ActiveDuty): string {
  return `until ${formatTime(duty.shiftEndsAt)}`;
}
