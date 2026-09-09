import { createClient } from '@/lib/supabase/server';
import { sanitiseSearch } from '@/lib/search';
import type { CardStatus, CredentialState, PersonStatus } from '@/lib/types';

/**
 * The student register, as all three applications need to read it.
 *
 * Three teams share this database and two different answers to "what is a
 * student's number and department" grew up in it. The canonical answer is
 * enrolments.student_number and departments.name; people.student_id and
 * people.department are a projection of them, maintained by trigger since
 * migration 0106.
 *
 * Every read here takes the projected column when it has a value and falls
 * back to the joined enrolment when it does not, so the dashboard is correct
 * both before that migration is applied and after.
 */

export type StudentRow = {
  id: string;
  fullName: string;
  studentNumber: string | null;
  department: string | null;
  departmentCode: string | null;
  programme: string | null;
  email: string | null;
  status: PersonStatus;
};

type PersonSelect = {
  id: string;
  student_id: string | null;
  full_name: string | null;
  given_name: string | null;
  family_name: string | null;
  department: string | null;
  email: string | null;
  status: PersonStatus;
  enrolments:
    | Array<{
        student_number: string | null;
        programme: string | null;
        status: string;
        departments: { code: string; name: string } | null;
      }>
    | null;
};

const PERSON_COLUMNS = `
  id, student_id, full_name, given_name, family_name, department, email, status,
  enrolments ( student_number, programme, status, departments ( code, name ) )
`;

/** Prefers the active enrolment, because a student may have finished others. */
function currentEnrolment(person: PersonSelect) {
  const all = person.enrolments ?? [];
  return all.find((entry) => entry.status === 'active') ?? all[0] ?? null;
}

function toStudent(person: PersonSelect): StudentRow {
  const enrolment = currentEnrolment(person);

  return {
    id: person.id,
    fullName:
      person.full_name?.trim() ||
      [person.given_name, person.family_name].filter(Boolean).join(' ') ||
      'Unnamed',
    studentNumber: person.student_id ?? enrolment?.student_number ?? null,
    department: person.department ?? enrolment?.departments?.name ?? null,
    departmentCode: enrolment?.departments?.code ?? null,
    programme: enrolment?.programme ?? null,
    email: person.email,
    status: person.status,
  };
}

export async function listStudents(search: string, limit = 200): Promise<StudentRow[]> {
  const supabase = await createClient();
  const term = sanitiseSearch(search);

  let query = supabase
    .from('people')
    .select(PERSON_COLUMNS)
    .eq('role', 'student')
    .order('full_name')
    .limit(limit);

  if (term) {
    query = query.or(`full_name.ilike.%${term}%,student_id.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data as unknown as PersonSelect[]).map(toStudent);
}

export async function getStudent(personId: string): Promise<StudentRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('people')
    .select(PERSON_COLUMNS)
    .eq('id', personId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toStudent(data as unknown as PersonSelect) : null;
}

/* ── Cards and credentials ────────────────────────────────────────────── */

export type CardRecord = {
  id: string;
  sequenceNo: number;
  status: CardStatus;
  issuedAt: string | null;
};

export type CredentialRecord = {
  id: string;
  jti: string;
  issuedAt: string | null;
  expiresAt: string | null;
  state: CredentialState | 'unknown';
  reasonCode: string | null;
  changedAt: string | null;
};

type CredentialSelect = {
  id: string;
  jti: string;
  issued_at: string | null;
  expires_at: string | null;
  credential_status:
    | { status: CredentialState; changed_at: string; reason_code: string | null }
    | Array<{ status: CredentialState; changed_at: string; reason_code: string | null }>
    | null;
};

/** credential_status is one row per credential, but PostgREST may nest it as an array. */
function firstStatus(row: CredentialSelect) {
  const status = row.credential_status;
  if (!status) return null;
  return Array.isArray(status) ? (status[0] ?? null) : status;
}

function toCredential(row: CredentialSelect): CredentialRecord {
  const status = firstStatus(row);

  return {
    id: row.id,
    jti: row.jti,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    state: status?.status ?? 'unknown',
    reasonCode: status?.reason_code ?? null,
    changedAt: status?.changed_at ?? null,
  };
}

/** Every credential a student has held, newest first. */
export async function listCredentials(personId: string): Promise<CredentialRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('credentials')
    .select('id, jti, issued_at, expires_at, credential_status ( status, changed_at, reason_code )')
    .eq('person_id', personId)
    .order('issued_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as unknown as CredentialSelect[]).map(toCredential);
}

export async function latestCard(personId: string): Promise<CardRecord | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('cards')
    .select('id, sequence_no, status, issued_at')
    .eq('person_id', personId)
    .order('sequence_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    sequenceNo: data.sequence_no,
    status: data.status,
    issuedAt: data.issued_at,
  };
}
