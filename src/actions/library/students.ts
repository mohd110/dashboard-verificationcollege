'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { getLibrarianContext } from '@/lib/auth/librarian';
import { verifyStudentByCode } from '@/lib/verification/verify';

// ─── Lookup Student ────────────────────────────────────────────────────────
// Browsing the register, and nothing more. This must never be the way a
// student is identified at the desk: picking a name out of a list verifies
// nobody. Issue and return both go through the card scanner instead.
export async function lookupStudents(query: string) {
  if (!query || query.trim().length < 2) return [];

  const { universityId } = await getLibrarianContext();
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from('people')
    .select('id, student_id, full_name, email, department, status')
    .eq('university_id', universityId)
    .eq('role', 'student')
    .or(`full_name.ilike.%${query}%,student_id.ilike.%${query}%`)
    .limit(10);

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── Get Student Library Profile ──────────────────────────────────────────
export async function getStudentLibraryProfile(personId: string) {
  const { universityId } = await getLibrarianContext();
  const supabase = await createServiceClient();

  // Get person details
  const { data: person, error: personError } = await supabase
    .from('people')
    .select('id, student_id, full_name, email, department, status, university_id')
    .eq('id', personId)
    .eq('university_id', universityId)
    .single();

  if (personError || !person) throw new Error('Student not found');

  // A profile reached from a list is a register lookup, not a card check. The
  // result says so, and the desk must scan the card before issuing anything.
  const verification = person.student_id
    ? await verifyStudentByCode(person.student_id)
    : null;

  // Get active books (not returned)
  const { data: activeTransactions } = await supabase
    .from('book_transactions')
    .select(`
      id, issued_at, due_date, returned_at, action,
      books(id, title, book_code, author)
    `)
    .eq('person_id', personId)
    .eq('university_id', universityId)
    .is('returned_at', null)
    .order('issued_at', { ascending: false });

  // Get full transaction history
  const { data: history } = await supabase
    .from('book_transactions')
    .select(`
      id, action, issued_at, due_date, returned_at, created_at,
      books(title, book_code, author),
      actors:people!book_transactions_actor_id_fkey(full_name)
    `)
    .eq('person_id', personId)
    .eq('university_id', universityId)
    .order('created_at', { ascending: false })
    .limit(20);

  const now = new Date();
  const overdueCount = (activeTransactions ?? []).filter(
    t => t.due_date && new Date(t.due_date) < now
  ).length;

  return {
    person,
    verification,
    activeTransactions: activeTransactions ?? [],
    history: history ?? [],
    stats: {
      activeBooks: (activeTransactions ?? []).length,
      totalTransactions: (history ?? []).length,
      overdueBooks: overdueCount,
    },
  };
}

// ─── Get All Students ─────────────────────────────────────────────────────
export async function getAllStudents(query?: string) {
  const { universityId } = await getLibrarianContext();
  const supabase = await createServiceClient();

  let q = supabase
    .from('people')
    .select('id, student_id, full_name, email, department, status, created_at')
    .eq('university_id', universityId)
    .eq('role', 'student')
    .order('full_name');

  if (query && query.trim()) {
    q = q.or(`full_name.ilike.%${query}%,student_id.ilike.%${query}%,department.ilike.%${query}%`);
  }

  const { data, error } = await q.limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}
