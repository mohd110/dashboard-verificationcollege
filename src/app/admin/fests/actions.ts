'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import type { ActionState } from '@/lib/action-state';
import { isMissingFestTables, parseCampusDateTime } from '@/lib/fests';
import { assertAdminForAction } from '@/lib/session';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * Running a fest.
 *
 * Every write to the fest tables goes through the administrator's own
 * session, so the policies in migration 0109 check it independently. The one
 * exception is the fest's campus location, which has no admin write policy on
 * the live database and is written with the service role after the
 * administrator check — see createFest.
 */

const MIGRATION_HINT =
  'The fest tables do not exist yet. Run supabase/migrations/0109_campus_fests.sql in the Supabase SQL editor first.';

function failure(error: { code?: string; message?: string } | null, fallback: string): ActionState {
  if (isMissingFestTables(error)) return { error: MIGRATION_HINT, message: null };
  if (error && /row-level security|permission denied/i.test(error.message ?? '')) {
    return { error: 'Your role does not permit that.', message: null };
  }
  return { error: error?.message ? `${fallback} ${error.message}` : fallback, message: null };
}

/** A short code for the fest's location, readable on a trail row. */
function locationCode(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18);
  return `FEST-${slug || 'EVENT'}-${randomBytes(2).toString('hex').toUpperCase()}`;
}

/* ── The fest ─────────────────────────────────────────────────────────── */

const festRequest = z.object({
  name: z.string().trim().min(3, 'Give the fest a name of at least three characters.').max(120),
  category: z.enum(['cultural', 'technical', 'sports', 'academic', 'agricultural', 'other']),
  venue: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  startsAt: z.string().min(1, 'Choose when the fest opens.'),
  endsAt: z.string().min(1, 'Choose when the fest closes.'),
  regularise: z.enum(['on', 'off']).optional(),
});

export async function createFest(_state: ActionState, formData: FormData): Promise<ActionState> {
  const session = await assertAdminForAction();

  const parsed = festRequest.safeParse({
    name: formData.get('name'),
    category: formData.get('category'),
    venue: formData.get('venue') || undefined,
    description: formData.get('description') || undefined,
    startsAt: formData.get('startsAt'),
    endsAt: formData.get('endsAt'),
    regularise: formData.get('regularise') ? 'on' : 'off',
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message, message: null };

  const startsAt = parseCampusDateTime(parsed.data.startsAt);
  const endsAt = parseCampusDateTime(parsed.data.endsAt);

  if (!startsAt || !endsAt) return { error: 'Those dates could not be read.', message: null };
  if (endsAt <= startsAt) return { error: 'The fest has to close after it opens.', message: null };
  if (endsAt.getTime() - startsAt.getTime() > 21 * 86_400_000) {
    return { error: 'A fest can run for three weeks at most.', message: null };
  }

  const supabase = await createClient();

  // Checked before the location is created, so a missing migration does not
  // leave an orphaned location behind.
  const probe = await supabase.from('campus_fests').select('id').limit(1);
  if (probe.error) return failure(probe.error, 'The fest could not be created.');

  // The fest's own place on campus. Scans recorded here are its attendance.
  //
  // Written with the service role: campus_locations has no admin write policy
  // on the live database (migration 0105 was never applied there — see the
  // note in admin/locations/actions). The caller has already been checked as
  // an administrator above, and the university comes from their session.
  const service = await createServiceClient();
  const { data: location, error: locationError } = await service
    .from('campus_locations')
    .insert({
      university_id: session.universityId,
      code: locationCode(parsed.data.name),
      name: parsed.data.name,
      type: 'general',
      status: 'active',
    })
    .select('id')
    .single();

  if (locationError || !location) return failure(locationError, 'The fest location could not be created.');

  const { data: fest, error } = await supabase
    .from('campus_fests')
    .insert({
      university_id: session.universityId,
      location_id: location.id,
      name: parsed.data.name,
      category: parsed.data.category,
      venue: parsed.data.venue ?? null,
      description: parsed.data.description ?? null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      regularise_attendance: parsed.data.regularise === 'on',
      created_by: session.userId,
    })
    .select('id')
    .single();

  if (error || !fest) {
    // Nothing references the location yet, so retiring it is safe and keeps
    // an abandoned fest from appearing as a live place to scan.
    await service
      .from('campus_locations')
      .update({ status: 'inactive' })
      .eq('id', location.id)
      .eq('university_id', session.universityId);
    return failure(error, 'The fest could not be created.');
  }

  revalidatePath('/admin/fests');
  redirect(`/admin/fests/${fest.id}?created=1`);
}

const idRequest = z.object({ festId: z.uuid() });

/**
 * Cancelling retires the fest's location as well, so a guard still holding a
 * shift for it cannot record anything there: record_campus_event refuses an
 * inactive location, whatever the gate app thinks.
 */
export async function cancelFest(_state: ActionState, formData: FormData): Promise<ActionState> {
  const session = await assertAdminForAction();

  const parsed = idRequest.safeParse({ festId: formData.get('festId') });
  if (!parsed.success) return { error: 'That fest could not be identified.', message: null };

  const supabase = await createClient();
  const { data: fest, error } = await supabase
    .from('campus_fests')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', parsed.data.festId)
    .select('location_id')
    .single();

  if (error || !fest) return failure(error, 'The fest could not be cancelled.');

  // Service role for the same reason as in createFest.
  const service = await createServiceClient();
  const { error: retireError } = await service
    .from('campus_locations')
    .update({ status: 'inactive' })
    .eq('id', fest.location_id)
    .eq('university_id', session.universityId);

  if (retireError) {
    return {
      error: `The fest is cancelled, but its gate could not be retired: ${retireError.message}`,
      message: null,
    };
  }

  revalidatePath('/admin/fests');
  revalidatePath(`/admin/fests/${parsed.data.festId}`);
  return { error: null, message: 'Fest cancelled. Its gates no longer accept scans.' };
}

/* ── Coordinators ─────────────────────────────────────────────────────── */

const coordinatorRequest = z.object({
  festId: z.uuid(),
  fullName: z.string().trim().min(2, 'Enter the coordinator’s name.').max(120),
  designation: z.string().trim().min(2, 'Enter what they coordinate.').max(120),
  kind: z.enum(['faculty', 'student', 'staff', 'volunteer']),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s-]*$/, 'A phone number may contain digits, spaces, dashes and a leading +.')
    .optional(),
  email: z.union([z.email('That email address does not look right.'), z.literal('')]).optional(),
  studentNumber: z.string().trim().max(32).optional(),
});

export async function addCoordinator(_state: ActionState, formData: FormData): Promise<ActionState> {
  const session = await assertAdminForAction();

  const parsed = coordinatorRequest.safeParse({
    festId: formData.get('festId'),
    fullName: formData.get('fullName'),
    designation: formData.get('designation'),
    kind: formData.get('kind'),
    phone: formData.get('phone') || undefined,
    email: formData.get('email') || undefined,
    studentNumber: formData.get('studentNumber') || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message, message: null };

  const supabase = await createClient();

  // A student coordinator on the register is linked, so their own days on
  // duty can be regularised without anybody typing their number twice.
  let personId: string | null = null;
  if (parsed.data.studentNumber) {
    const { data: person } = await supabase
      .from('people')
      .select('id')
      .eq('student_id', parsed.data.studentNumber)
      .maybeSingle();

    if (!person) {
      return { error: `No student on the register has the number ${parsed.data.studentNumber}.`, message: null };
    }
    personId = person.id;
  }

  const { error } = await supabase.from('fest_coordinators').insert({
    fest_id: parsed.data.festId,
    university_id: session.universityId,
    full_name: parsed.data.fullName,
    designation: parsed.data.designation,
    kind: parsed.data.kind,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    person_id: personId,
  });

  if (error) return failure(error, 'The coordinator could not be added.');

  revalidatePath(`/admin/fests/${parsed.data.festId}`);
  return { error: null, message: `${parsed.data.fullName} added.` };
}

const removeRequest = z.object({ festId: z.uuid(), id: z.uuid() });

export async function removeCoordinator(_state: ActionState, formData: FormData): Promise<ActionState> {
  await assertAdminForAction();
  const parsed = removeRequest.safeParse({ festId: formData.get('festId'), id: formData.get('id') });
  if (!parsed.success) return { error: 'That coordinator could not be identified.', message: null };

  const supabase = await createClient();
  const { error } = await supabase.from('fest_coordinators').delete().eq('id', parsed.data.id);
  if (error) return failure(error, 'The coordinator could not be removed.');

  revalidatePath(`/admin/fests/${parsed.data.festId}`);
  return { error: null, message: 'Removed.' };
}

/* ── Guard duties ─────────────────────────────────────────────────────── */

const dutyRequest = z.object({
  festId: z.uuid(),
  guardUserId: z.uuid('Choose a guard.'),
  post: z.string().trim().min(2, 'Name the post — "Gate B", "Main stage".').max(80),
  shiftStartsAt: z.string().min(1, 'Choose when the shift starts.'),
  shiftEndsAt: z.string().min(1, 'Choose when the shift ends.'),
});

/** Time either side of the fest a guard may be rostered: setting up, clearing out. */
const SHIFT_MARGIN_MS = 3 * 60 * 60 * 1000;

export async function assignGuard(_state: ActionState, formData: FormData): Promise<ActionState> {
  const session = await assertAdminForAction();

  const parsed = dutyRequest.safeParse({
    festId: formData.get('festId'),
    guardUserId: formData.get('guardUserId'),
    post: formData.get('post'),
    shiftStartsAt: formData.get('shiftStartsAt'),
    shiftEndsAt: formData.get('shiftEndsAt'),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message, message: null };

  const start = parseCampusDateTime(parsed.data.shiftStartsAt);
  const end = parseCampusDateTime(parsed.data.shiftEndsAt);
  if (!start || !end) return { error: 'Those shift times could not be read.', message: null };
  if (end <= start) return { error: 'A shift has to end after it starts.', message: null };

  const supabase = await createClient();

  const { data: fest, error: festError } = await supabase
    .from('campus_fests')
    .select('starts_at, ends_at, cancelled_at')
    .eq('id', parsed.data.festId)
    .single();

  if (festError || !fest) return failure(festError, 'That fest could not be found.');
  if (fest.cancelled_at) return { error: 'This fest has been cancelled.', message: null };

  if (
    start.getTime() < new Date(fest.starts_at).getTime() - SHIFT_MARGIN_MS ||
    end.getTime() > new Date(fest.ends_at).getTime() + SHIFT_MARGIN_MS
  ) {
    return {
      error: 'A shift has to fall within the fest, give or take three hours for setting up and clearing out.',
      message: null,
    };
  }

  // Only somebody who actually holds the guard role, at this university. The
  // policy would accept any staff id; a roster with a librarian on Gate B is
  // not something anybody meant.
  const { data: guard } = await supabase
    .from('user_roles')
    .select('user_id, app_users!inner ( university_id, display_name )')
    .eq('user_id', parsed.data.guardUserId)
    .eq('role', 'guard')
    .maybeSingle();

  const guardRow = guard as unknown as {
    app_users: { university_id: string; display_name: string };
  } | null;

  if (!guardRow || guardRow.app_users.university_id !== session.universityId) {
    return { error: 'That person is not a guard at this university.', message: null };
  }

  // Two posts at once is two places at once.
  const { data: clash } = await supabase
    .from('fest_guard_duties')
    .select('post')
    .eq('guard_user_id', parsed.data.guardUserId)
    .lt('shift_starts_at', end.toISOString())
    .gt('shift_ends_at', start.toISOString())
    .limit(1);

  if (clash && clash.length > 0) {
    return {
      error: `${guardRow.app_users.display_name} is already on duty at ${clash[0].post} during that time.`,
      message: null,
    };
  }

  const { error } = await supabase.from('fest_guard_duties').insert({
    fest_id: parsed.data.festId,
    university_id: session.universityId,
    guard_user_id: parsed.data.guardUserId,
    post: parsed.data.post,
    shift_starts_at: start.toISOString(),
    shift_ends_at: end.toISOString(),
    created_by: session.userId,
  });

  if (error) return failure(error, 'The duty could not be assigned.');

  revalidatePath(`/admin/fests/${parsed.data.festId}`);
  return { error: null, message: `${guardRow.app_users.display_name} rostered at ${parsed.data.post}.` };
}

export async function removeDuty(_state: ActionState, formData: FormData): Promise<ActionState> {
  await assertAdminForAction();
  const parsed = removeRequest.safeParse({ festId: formData.get('festId'), id: formData.get('id') });
  if (!parsed.success) return { error: 'That duty could not be identified.', message: null };

  const supabase = await createClient();
  const { error } = await supabase.from('fest_guard_duties').delete().eq('id', parsed.data.id);
  if (error) return failure(error, 'The duty could not be removed.');

  revalidatePath(`/admin/fests/${parsed.data.festId}`);
  return { error: null, message: 'Duty removed.' };
}

/* ── Regularisation ───────────────────────────────────────────────────── */

const decisionRequest = z.object({
  festId: z.uuid(),
  personId: z.uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['approved', 'rejected']),
  basis: z.enum(['scanned', 'on_duty', 'manual']).default('scanned'),
  note: z.string().trim().max(300).optional(),
});

/**
 * Approves or rejects one student's day.
 *
 * An upsert, and deliberately so: changing a decision is a normal thing to do.
 * Unlike credential_status, this table's policy is FOR ALL, so the INSERT half
 * of the upsert is permitted as well as the UPDATE.
 */
export async function decideRegularisation(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertAdminForAction();

  const parsed = decisionRequest.safeParse({
    festId: formData.get('festId'),
    personId: formData.get('personId'),
    day: formData.get('day'),
    status: formData.get('status'),
    basis: formData.get('basis') || 'scanned',
    note: formData.get('note') || undefined,
  });

  if (!parsed.success) return { error: 'That decision could not be read.', message: null };

  const supabase = await createClient();
  const { error } = await supabase.from('fest_regularisations').upsert(
    {
      fest_id: parsed.data.festId,
      university_id: session.universityId,
      person_id: parsed.data.personId,
      attended_on: parsed.data.day,
      status: parsed.data.status,
      basis: parsed.data.basis,
      note: parsed.data.note ?? null,
      decided_by: session.userId,
      decided_at: new Date().toISOString(),
    },
    { onConflict: 'fest_id,person_id,attended_on' },
  );

  if (error) return failure(error, 'The decision could not be saved.');

  revalidatePath(`/admin/fests/${parsed.data.festId}`);
  return { error: null, message: parsed.data.status === 'approved' ? 'Regularised.' : 'Rejected.' };
}

const bulkRequest = z.object({
  festId: z.uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  personIds: z.string().min(1, 'Nobody is waiting for a decision on that day.'),
});

/** Approves every pending student for one day, in a single write. */
export async function approveAllPending(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertAdminForAction();

  const parsed = bulkRequest.safeParse({
    festId: formData.get('festId'),
    day: formData.get('day'),
    personIds: formData.get('personIds'),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message, message: null };

  const ids = parsed.data.personIds
    .split(',')
    .map((value) => value.trim())
    .filter((value) => z.uuid().safeParse(value).success);

  if (ids.length === 0) return { error: 'Nobody is waiting for a decision on that day.', message: null };

  const now = new Date().toISOString();
  const supabase = await createClient();

  // ignoreDuplicates: a decision somebody has already made — including a
  // rejection — is left exactly as it is. "Approve all pending" must never
  // quietly overturn a "no".
  const { error } = await supabase.from('fest_regularisations').upsert(
    ids.map((personId) => ({
      fest_id: parsed.data.festId,
      university_id: session.universityId,
      person_id: personId,
      attended_on: parsed.data.day,
      status: 'approved',
      basis: 'scanned',
      decided_by: session.userId,
      decided_at: now,
    })),
    { onConflict: 'fest_id,person_id,attended_on', ignoreDuplicates: true },
  );

  if (error) return failure(error, 'The approvals could not be saved.');

  revalidatePath(`/admin/fests/${parsed.data.festId}`);
  return { error: null, message: `${ids.length} student${ids.length === 1 ? '' : 's'} regularised.` };
}

const onDutyRequest = z.object({
  festId: z.uuid(),
  studentNumber: z.string().trim().min(2, 'Enter the student number.').max(32),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the day.'),
  basis: z.enum(['on_duty', 'manual']),
  note: z.string().trim().min(3, 'Say why — "stage volunteer", "registration desk".').max(300),
});

/**
 * Adds somebody who worked the fest without passing a gate.
 *
 * The volunteer on the registration desk was there all day and was never
 * scanned, because they were the one doing the scanning. The note is required
 * by the database as well as here: nobody reaches this list on an
 * administrator's say-so without the reason being written down.
 */
export async function addOnDuty(_state: ActionState, formData: FormData): Promise<ActionState> {
  const session = await assertAdminForAction();

  const parsed = onDutyRequest.safeParse({
    festId: formData.get('festId'),
    studentNumber: formData.get('studentNumber'),
    day: formData.get('day'),
    basis: formData.get('basis'),
    note: formData.get('note'),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message, message: null };

  const supabase = await createClient();
  const { data: person } = await supabase
    .from('people')
    .select('id, full_name, role')
    .eq('student_id', parsed.data.studentNumber)
    .maybeSingle();

  if (!person) {
    return { error: `No student on the register has the number ${parsed.data.studentNumber}.`, message: null };
  }

  const { error } = await supabase.from('fest_regularisations').upsert(
    {
      fest_id: parsed.data.festId,
      university_id: session.universityId,
      person_id: person.id,
      attended_on: parsed.data.day,
      status: 'approved',
      basis: parsed.data.basis,
      note: parsed.data.note,
      decided_by: session.userId,
      decided_at: new Date().toISOString(),
    },
    { onConflict: 'fest_id,person_id,attended_on' },
  );

  if (error) return failure(error, 'That student could not be added.');

  revalidatePath(`/admin/fests/${parsed.data.festId}`);
  return { error: null, message: `${person.full_name} regularised as ${parsed.data.basis === 'on_duty' ? 'on duty' : 'a manual entry'}.` };
}
