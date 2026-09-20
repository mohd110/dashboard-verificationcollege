/**
 * The shapes the library screens read.
 *
 * PostgREST returns an embedded join as a nested object, and its generated
 * types do not survive the `.select()` string, so the library pages were
 * written against `any` and cast each nested piece at the point of use. These
 * types say the same thing once, in one place, and let the compiler check the
 * field names the screens actually read.
 *
 * Everything nested is optional on purpose: a left join returns null, and a
 * transaction whose book row has been removed should render a dash rather than
 * throw.
 */

/**
 * An embedded join, as PostgREST hands it over.
 *
 * A to-one embed comes back as an object, but the generated types describe it
 * as an array, and which of the two you get depends on how the relationship
 * was detected. `one()` below flattens both, which is why the screens never
 * have to care.
 */
export type Embedded<T> = T | T[] | null | undefined;

export function one<T>(value: Embedded<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type BookRef = { title?: string; book_code?: string; author?: string };
export type PersonRef = { full_name?: string; student_id?: string; department?: string };
export type ActorRef = { full_name?: string };

/** A row of book_transactions with its book, student and librarian attached. */
export type TransactionRow = {
  id: string;
  action?: string;
  issued_at?: string | null;
  due_date?: string | null;
  returned_at?: string | null;
  created_at?: string | null;
  notes?: string | null;
  books?: Embedded<BookRef>;
  people?: Embedded<PersonRef>;
  actors?: Embedded<ActorRef>;
};

/** A row of books, as the dashboard and the catalogue list it. */
export type BookRow = {
  id: string;
  book_code: string;
  title: string;
  author: string | null;
  isbn: string | null;
  genre: string | null;
  status: string;
  total_copies: number;
  available_copies: number;
  created_at?: string | null;
};

/** A row of notifications with the student it went to. */
export type NotificationRow = {
  id: string;
  type: string;
  channel: string;
  status: string;
  recipient_email: string | null;
  subject: string | null;
  sent_at: string | null;
  error: string | null;
  created_at: string | null;
  people?: Embedded<PersonRef>;
};
