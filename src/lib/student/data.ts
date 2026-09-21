import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { verifyCredential } from '@/lib/verification/verify';
import type { VerificationResult } from '@/lib/verification/contract';

/**
 * What a student may see about themselves.
 *
 * Every read here goes through the service role, because a student has no
 * Supabase session for row level security to act on — they authenticated by
 * presenting a signed credential, not by logging in. That makes the filtering
 * this module's own responsibility, so every query below is pinned to the one
 * person id on the pass. There is no function here that takes a person id from
 * a request; callers pass the id off the verified cookie and nothing else.
 */

export type StudentProfile = {
  id: string;
  fullName: string;
  studentNumber: string | null;
  department: string | null;
  programme: string | null;
  email: string | null;
  status: string;
  universityId: string;
  universityName: string;
  universityCode: string;
};

export async function getStudentProfile(personId: string): Promise<StudentProfile | null> {
  const supabase = await createServiceClient();

  const { data } = await supabase
    .from('people')
    .select(
      `id, university_id, full_name, given_name, family_name, student_id, department, email, status,
       universities ( legal_name, code ),
       enrolments ( programme, status, departments ( name ) )`,
    )
    .eq('id', personId)
    .maybeSingle();

  if (!data) return null;

  const row = data as unknown as {
    id: string;
    university_id: string;
    full_name: string | null;
    given_name: string | null;
    family_name: string | null;
    student_id: string | null;
    department: string | null;
    email: string | null;
    status: string;
    universities: { legal_name: string; code: string } | null;
    enrolments: Array<{
      programme: string | null;
      status: string;
      departments: { name: string } | null;
    }> | null;
  };

  const enrolments = row.enrolments ?? [];
  const current = enrolments.find((e) => e.status === 'active') ?? enrolments[0] ?? null;

  return {
    id: row.id,
    fullName:
      row.full_name?.trim() ||
      [row.given_name, row.family_name].filter(Boolean).join(' ') ||
      'Unnamed',
    studentNumber: row.student_id,
    department: row.department ?? current?.departments?.name ?? null,
    programme: current?.programme ?? null,
    email: row.email,
    status: row.status,
    universityId: row.university_id,
    universityName: row.universities?.legal_name ?? 'University',
    universityCode: row.universities?.code ?? '',
  };
}

export type PassCard = {
  credentialId: string;
  jti: string;
  compactJws: string;
  issuedAt: string | null;
  expiresAt: string | null;
  state: string;
  reasonCode: string | null;
  /**
   * What a verifier would decide about this card right now.
   *
   * Run live rather than read off credential_status, because the two can
   * disagree: a card can be perfectly active and still be a month past its
   * expiry date. This is the whole point of the screen — a student can see the
   * answer the gate will give before they walk to it.
   */
  verdict: VerificationResult;
};

/** The newest credential this student holds, with a live verdict on it. */
export async function getPassCard(personId: string): Promise<PassCard | null> {
  const supabase = await createServiceClient();

  const { data } = await supabase
    .from('credentials')
    .select('id, jti, compact_jws, issued_at, expires_at, credential_status ( status, reason_code )')
    .eq('person_id', personId)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const row = data as unknown as {
    id: string;
    jti: string;
    compact_jws: string;
    issued_at: string | null;
    expires_at: string | null;
    credential_status:
      | { status: string; reason_code: string | null }
      | Array<{ status: string; reason_code: string | null }>
      | null;
  };

  const status = Array.isArray(row.credential_status)
    ? row.credential_status[0]
    : row.credential_status;

  return {
    credentialId: row.id,
    jti: row.jti,
    compactJws: row.compact_jws,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    state: status?.status ?? 'unknown',
    reasonCode: status?.reason_code ?? null,
    verdict: await verifyCredential(row.compact_jws, undefined, { anonymous: true }),
  };
}

export type StudentEvent = {
  id: string;
  seq: number;
  eventType: string;
  result: string;
  occurredAt: string;
  locationName: string | null;
  metadata: Record<string, unknown>;
};

/** This student's own campus history, newest first. */
export async function getStudentActivity(personId: string, limit = 100): Promise<StudentEvent[]> {
  const supabase = await createServiceClient();

  const { data } = await supabase
    .from('campus_events')
    .select('id, seq, event_type, result, occurred_at, metadata, campus_locations ( name )')
    .eq('person_id', personId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as Array<{
    id: string;
    seq: number;
    event_type: string;
    result: string;
    occurred_at: string;
    metadata: Record<string, unknown> | null;
    campus_locations: { name: string } | null;
  }>).map((row) => ({
    id: row.id,
    seq: row.seq,
    eventType: row.event_type,
    result: row.result,
    occurredAt: row.occurred_at,
    locationName: row.campus_locations?.name ?? null,
    metadata: row.metadata ?? {},
  }));
}

export type Loan = {
  id: string;
  title: string;
  bookCode: string | null;
  author: string | null;
  issuedAt: string | null;
  dueDate: string | null;
  returnedAt: string | null;
  /** Whole days late, or 0. Counted on the due date, not the hour. */
  daysOverdue: number;
};

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export type LibraryStanding = {
  onLoan: Loan[];
  returned: Loan[];
  overdueCount: number;
  /** The next thing due, if anything is out. */
  nextDue: Loan | null;
};

/** Everything this student has borrowed, and what is still out. */
export async function getLibraryStanding(personId: string): Promise<LibraryStanding> {
  const supabase = await createServiceClient();

  const { data } = await supabase
    .from('book_transactions')
    .select('id, issued_at, due_date, returned_at, books ( title, book_code, author )')
    .eq('person_id', personId)
    .order('issued_at', { ascending: false })
    .limit(60);

  const now = new Date();

  const all: Loan[] = ((data ?? []) as unknown as Array<{
    id: string;
    issued_at: string | null;
    due_date: string | null;
    returned_at: string | null;
    books: { title: string; book_code: string; author: string | null } | Array<{ title: string; book_code: string; author: string | null }> | null;
  }>).map((row) => {
    const book = Array.isArray(row.books) ? row.books[0] : row.books;
    const due = row.due_date ? new Date(row.due_date) : null;

    return {
      id: row.id,
      title: book?.title ?? 'Unknown title',
      bookCode: book?.book_code ?? null,
      author: book?.author ?? null,
      issuedAt: row.issued_at,
      dueDate: row.due_date,
      returnedAt: row.returned_at,
      daysOverdue: !row.returned_at && due && due < now ? Math.max(0, daysBetween(due, now)) : 0,
    };
  });

  const onLoan = all.filter((loan) => !loan.returnedAt);
  const withDue = onLoan.filter((loan) => loan.dueDate);

  return {
    onLoan,
    returned: all.filter((loan) => loan.returnedAt),
    overdueCount: onLoan.filter((loan) => loan.daysOverdue > 0).length,
    nextDue:
      withDue.sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))[0] ?? null,
  };
}

/* ── Fests ────────────────────────────────────────────────────────────── */

export type CampusFest = {
  id: string;
  name: string;
  category: string;
  venue: string | null;
  description: string | null;
  startsAt: string;
  endsAt: string;
  live: boolean;
  regulariseAttendance: boolean;
  coordinators: Array<{ name: string; designation: string; phone: string | null; email: string | null }>;
};

export type MyFestDay = {
  day: string;
  scanned: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'not_applicable';
  basis: string | null;
};

export type MyFest = {
  festId: string;
  name: string;
  regulariseAttendance: boolean;
  days: MyFestDay[];
};

export type StudentFests = {
  /** Live and upcoming, soonest first. */
  onCampus: CampusFest[];
  /** Fests this student was at, with the decision for each day. */
  mine: MyFest[];
};

/** yyyy-mm-dd on the campus clock. */
function campusDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/**
 * What is on at the student's university, and how their own fest days stand.
 *
 * Reads with the service role for the same reason every student read does, and
 * is pinned the same way: fests by the student's own university id, attendance
 * and decisions by their own person id. Returns nothing at all, rather than
 * failing, before migration 0109 is applied, so the pass never breaks because
 * a feature it happens to show is not switched on yet.
 */
export async function getStudentFests(
  personId: string,
  universityId: string,
): Promise<StudentFests> {
  const supabase = await createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: fests, error } = await supabase
    .from('campus_fests')
    .select(
      'id, name, category, venue, description, starts_at, ends_at, regularise_attendance, cancelled_at, location_id',
    )
    .eq('university_id', universityId)
    .is('cancelled_at', null)
    .order('starts_at', { ascending: true })
    .limit(100);

  if (error || !fests || fests.length === 0) return { onCampus: [], mine: [] };

  const current = fests.filter((fest) => fest.ends_at > nowIso).slice(0, 6);

  const { data: coordinatorRows } = current.length
    ? await supabase
        .from('fest_coordinators')
        .select('fest_id, full_name, designation, phone, email, kind')
        .in(
          'fest_id',
          current.map((fest) => fest.id),
        )
        .order('created_at')
    : { data: [] as Array<{ fest_id: string; full_name: string; designation: string; phone: string | null; email: string | null; kind: string }> };

  const onCampus: CampusFest[] = current.map((fest) => ({
    id: fest.id,
    name: fest.name,
    category: fest.category,
    venue: fest.venue,
    description: fest.description,
    startsAt: fest.starts_at,
    endsAt: fest.ends_at,
    live: fest.starts_at <= nowIso && nowIso < fest.ends_at,
    regulariseAttendance: fest.regularise_attendance,
    coordinators: (coordinatorRows ?? [])
      .filter((row) => row.fest_id === fest.id)
      .map((row) => ({
        name: row.full_name,
        designation: row.designation,
        phone: row.phone,
        email: row.email,
      })),
  }));

  // The student's own record at each fest's gate: VALID scans only.
  const byLocation = new Map(fests.map((fest) => [fest.location_id, fest]));
  const [{ data: scans }, { data: decisions }] = await Promise.all([
    supabase
      .from('campus_events')
      .select('location_id, occurred_at')
      .eq('person_id', personId)
      .eq('event_type', 'IDENTITY_VERIFIED')
      .eq('result', 'VALID')
      .in('location_id', [...byLocation.keys()]),
    supabase
      .from('fest_regularisations')
      .select('fest_id, attended_on, status, basis')
      .eq('person_id', personId),
  ]);

  const mine = new Map<string, MyFest>();
  const dayOf = (festId: string, day: string): MyFestDay => {
    const fest = fests.find((candidate) => candidate.id === festId)!;
    let entry = mine.get(festId);
    if (!entry) {
      entry = {
        festId,
        name: fest.name,
        regulariseAttendance: fest.regularise_attendance,
        days: [],
      };
      mine.set(festId, entry);
    }
    let found = entry.days.find((candidate) => candidate.day === day);
    if (!found) {
      found = {
        day,
        scanned: false,
        status: fest.regularise_attendance ? 'pending' : 'not_applicable',
        basis: null,
      };
      entry.days.push(found);
    }
    return found;
  };

  for (const scan of scans ?? []) {
    const fest = byLocation.get(scan.location_id as string);
    if (!fest) continue;
    dayOf(fest.id, campusDay(scan.occurred_at)).scanned = true;
  }

  for (const decision of decisions ?? []) {
    if (!fests.some((fest) => fest.id === decision.fest_id)) continue;
    const day = dayOf(decision.fest_id, decision.attended_on);
    day.status = decision.status;
    day.basis = decision.basis;
  }

  return {
    onCampus,
    mine: [...mine.values()].map((fest) => ({
      ...fest,
      days: fest.days.sort((a, b) => (a.day < b.day ? -1 : 1)),
    })),
  };
}
