'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { getLibrarianContext } from '@/lib/auth/librarian';
import { tryRecordCampusEvent } from '@/lib/campus-events/adapter';
import { sendBookIssuedEmail } from '@/lib/email/resend';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ─── Dashboard Stats ──────────────────────────────────────────────────────
export async function getDashboardStats() {
  const { universityId } = await getLibrarianContext();
  const supabase = await createServiceClient();

  const [
    { count: totalBooks },
    { count: availableBooks },
    { count: issuedBooks },
    { count: todayTransactions },
    { count: overdueBooks },
  ] = await Promise.all([
    supabase.from('books').select('*', { count: 'exact', head: true }).eq('university_id', universityId),
    supabase.from('books').select('*', { count: 'exact', head: true }).eq('university_id', universityId).gt('available_copies', 0),
    supabase.from('book_transactions').select('*', { count: 'exact', head: true }).eq('university_id', universityId).is('returned_at', null),
    supabase.from('book_transactions').select('*', { count: 'exact', head: true }).eq('university_id', universityId).gte('created_at', new Date().toISOString().split('T')[0]),
    supabase.from('book_transactions').select('*', { count: 'exact', head: true }).eq('university_id', universityId).is('returned_at', null).lt('due_date', new Date().toISOString()),
  ]);

  return {
    totalBooks: totalBooks ?? 0,
    availableBooks: availableBooks ?? 0,
    issuedBooks: issuedBooks ?? 0,
    overdueBooks: overdueBooks ?? 0,
    todayTransactions: todayTransactions ?? 0,
  };
}

// ─── Recent Transactions ──────────────────────────────────────────────────
export async function getRecentTransactions(limit = 10) {
  const { universityId } = await getLibrarianContext();
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from('book_transactions')
    .select(`
      id, action, issued_at, due_date, returned_at, created_at,
      books(title, book_code),
      people!book_transactions_person_id_fkey(full_name, student_id),
      actors:people!book_transactions_actor_id_fkey(full_name)
    `)
    .eq('university_id', universityId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── Search Books ─────────────────────────────────────────────────────────
const searchBooksSchema = z.object({
  query: z.string().max(200).optional(),
  status: z.enum(['all', 'available', 'issued', 'reserved']).optional(),
});

export async function searchBooks(input: z.infer<typeof searchBooksSchema>) {
  const { query, status } = searchBooksSchema.parse(input);
  const { universityId } = await getLibrarianContext();
  const supabase = await createServiceClient();

  let q = supabase
    .from('books')
    .select('*')
    .eq('university_id', universityId)
    .order('title');

  if (query && query.trim()) {
    q = q.or(`title.ilike.%${query}%,author.ilike.%${query}%,isbn.ilike.%${query}%,book_code.ilike.%${query}%`);
  }

  if (status && status !== 'all') {
    if (status === 'available') q = q.gt('available_copies', 0);
    else q = q.eq('status', status);
  }

  const { data, error } = await q.limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── Issue Book ───────────────────────────────────────────────────────────
const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const issueBookSchema = z.object({
  studentPersonId: z.string().regex(uuidRegex, 'Invalid UUID'),
  bookId: z.string().regex(uuidRegex, 'Invalid UUID'),
  dueDays: z.number().int().min(1).max(60).default(14),
  /**
   * Whether the student was identified by a checked card signature. Recorded
   * on the event, so a later reader can tell an issue backed by cryptography
   * from one backed by a typed number.
   */
  signatureChecked: z.boolean().default(false),
});

export async function issueBook(input: z.infer<typeof issueBookSchema>) {
  const { studentPersonId, bookId, dueDays, signatureChecked } = issueBookSchema.parse(input);
  const librarian = await getLibrarianContext();
  const universityId = librarian.universityId;

  const supabase = await createServiceClient();

  // Get student details
  const { data: student } = await supabase
    .from('people')
    .select('id, full_name, given_name, family_name, email, university_id, status')
    .eq('id', studentPersonId)
    .single();

  if (!student) throw new Error('STUDENT_NOT_FOUND');
  if (student.university_id !== universityId) throw new Error('CROSS_UNIVERSITY_DENIED');
  if (student.status !== 'active') throw new Error(`Student status is ${student.status}. Cannot issue book.`);

  const studentName = student.full_name
    || `${student.given_name ?? ''} ${student.family_name ?? ''}`.trim();

  // Get book info
  const { data: book } = await supabase
    .from('books')
    .select('title, book_code, available_copies')
    .eq('id', bookId)
    .eq('university_id', universityId)
    .single();

  if (!book) throw new Error('BOOK_NOT_FOUND');
  if (book.available_copies < 1) throw new Error('BOOK_NOT_AVAILABLE — No copies available.');

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);

  // Atomic issue via RPC
  const { data: transactionId, error: rpcError } = await supabase.rpc('issue_book', {
    p_university_id: universityId,
    p_book_id: bookId,
    p_person_id: studentPersonId,
    p_actor_id: librarian.personId,
    p_location_id: librarian.locationId,
    p_due_date: dueDate.toISOString(),
  });

  if (rpcError) {
    const msg = rpcError.message;
    if (msg.includes('BOOK_NOT_AVAILABLE')) throw new Error('Book is no longer available.');
    if (msg.includes('BOOK_NOT_FOUND')) throw new Error('Book not found.');
    throw new Error(`Issue failed: ${msg}`);
  }

  const issuedAt = new Date().toISOString();

  // The book is in the student's hands whether or not the log write succeeds,
  // so a failure here is reported, not thrown. BOOK_ISSUED is never a system
  // event: a librarian issued the book, and the trail should say so.
  const issuedEvent = await tryRecordCampusEvent({
    eventType: 'BOOK_ISSUED',
    result: 'SUCCESS',
    personId: studentPersonId,
    locationId: librarian.locationId,
    entityType: 'book',
    entityId: bookId,
    metadata: {
      book_title: book.title,
      book_code: book.book_code,
      transaction_id: transactionId,
      due_date: dueDate.toISOString(),
      signature_checked: signatureChecked,
    },
    occurredAt: issuedAt,
  });

  // Create PENDING notification
  const { data: notification } = await supabase
    .from('notifications')
    .insert({
      university_id: universityId,
      person_id: studentPersonId,
      transaction_id: transactionId,
      type: 'BOOK_ISSUED',
      channel: 'email',
      status: 'PENDING',
      recipient_email: student.email,
      subject: `Book Issued — ${book.title} | University Smart Identity`,
    })
    .select('id')
    .single();

  // Send email
  const emailResult = await sendBookIssuedEmail({
    recipientName: studentName,
    recipientEmail: student.email ?? '',
    bookTitle: book.title,
    bookCode: book.book_code,
    issuedAt,
    dueDate: dueDate.toISOString(),
    libraryName: librarian.locationName,
    librarianName: librarian.name,
  });

  // Update notification status — never mark a failed send as SENT
  if (notification) {
    await supabase.from('notifications').update({
      status: emailResult.success ? 'SENT' : 'FAILED',
      sent_at: emailResult.success ? new Date().toISOString() : null,
      error: emailResult.success ? null : emailResult.error,
    }).eq('id', notification.id);
  }

  // Only after a genuine send. The event says an email reached a student; a
  // trail that records intentions rather than outcomes reads as if it were the
  // truth and is worse than none. A mailer has no human behind it, so this is
  // the one book-flow event attributed to the system.
  if (emailResult.success) {
    await tryRecordCampusEvent({
      eventType: 'NOTIFICATION_SENT',
      result: 'SENT',
      personId: studentPersonId,
      locationId: librarian.locationId,
      entityType: 'notification',
      entityId: notification?.id ?? null,
      metadata: { channel: 'email', transaction_id: transactionId, book_title: book.title },
      systemActor: true,
    });
  }

  revalidatePath('/library');
  revalidatePath('/library/transactions');

  return {
    success: true,
    transactionId,
    bookTitle: book.title,
    studentName,
    dueDate: dueDate.toISOString(),
    emailSent: emailResult.success,
    eventRecorded: issuedEvent.success,
    eventError: issuedEvent.error ?? null,
    chainPosition: issuedEvent.event?.seq ?? null,
  };
}

// ─── Return Book ──────────────────────────────────────────────────────────
const returnBookSchema = z.object({ transactionId: z.string().regex(uuidRegex, 'Invalid UUID') });

export async function returnBook(input: z.infer<typeof returnBookSchema>) {
  const { transactionId } = returnBookSchema.parse(input);
  const librarian = await getLibrarianContext();
  const universityId = librarian.universityId;

  const supabase = await createServiceClient();
  const { data: txn } = await supabase
    .from('book_transactions')
    .select(`
      id, book_id, person_id, returned_at,
      books(title, book_code),
      people!book_transactions_person_id_fkey(full_name, given_name, family_name)
    `)
    .eq('id', transactionId)
    .eq('university_id', universityId)
    .single();

  if (!txn) throw new Error('Transaction not found.');
  if (txn.returned_at) throw new Error('This book has already been returned.');

  const { error: rpcError } = await supabase.rpc('return_book', {
    p_transaction_id: transactionId,
    p_university_id: universityId,
  });

  if (rpcError) {
    const msg = rpcError.message;
    if (msg.includes('ALREADY_RETURNED')) throw new Error('Book already returned.');
    if (msg.includes('TRANSACTION_NOT_FOUND')) throw new Error('Transaction not found.');
    throw new Error(`Return failed: ${msg}`);
  }

  const txnBooks = txn.books as unknown as { title: string; book_code: string } | null;
  const txnPerson = txn.people as unknown as { full_name?: string; given_name?: string; family_name?: string } | null;
  const studentName = txnPerson?.full_name
    || `${txnPerson?.given_name ?? ''} ${txnPerson?.family_name ?? ''}`.trim();

  const returnedEvent = await tryRecordCampusEvent({
    eventType: 'BOOK_RETURNED',
    result: 'SUCCESS',
    personId: txn.person_id ?? null,
    locationId: librarian.locationId,
    entityType: 'book',
    entityId: txn.book_id ?? null,
    metadata: { transaction_id: transactionId, book_title: txnBooks?.title },
  });

  revalidatePath('/library');
  revalidatePath('/library/transactions');

  return {
    success: true,
    bookTitle: txnBooks?.title ?? 'Unknown Book',
    studentName,
    eventRecorded: returnedEvent.success,
    eventError: returnedEvent.error ?? null,
    chainPosition: returnedEvent.event?.seq ?? null,
  };
}
