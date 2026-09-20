'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { getLibrarianContext } from '@/lib/auth/librarian';

// ─── Get Transactions ─────────────────────────────────────────────────────
export async function getTransactions({
  limit = 50,
  action,
  studentQuery,
}: {
  limit?: number;
  action?: 'issued' | 'returned' | 'all';
  studentQuery?: string;
} = {}) {
  const { universityId } = await getLibrarianContext();
  const supabase = await createServiceClient();

  let q = supabase
    .from('book_transactions')
    .select(`
      id, action, issued_at, due_date, returned_at, created_at, notes,
      books(title, book_code, author),
      people!book_transactions_person_id_fkey(full_name, student_id, department),
      actors:people!book_transactions_actor_id_fkey(full_name)
    `)
    .eq('university_id', universityId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (action && action !== 'all') {
    // For 'issued', show ones not yet returned; for 'returned', show ones returned
    if (action === 'issued') {
      q = q.is('returned_at', null);
    } else {
      q = q.not('returned_at', 'is', null);
    }
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let results = data ?? [];

  if (studentQuery && studentQuery.trim()) {
    const lq = studentQuery.toLowerCase();
    results = results.filter(t => {
      const person = t.people as unknown as { full_name: string; student_id: string } | null;
      return (
        person?.full_name?.toLowerCase().includes(lq) ||
        person?.student_id?.toLowerCase().includes(lq)
      );
    });
  }

  return results;
}
