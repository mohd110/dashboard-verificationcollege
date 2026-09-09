/**
 * Mirrors of the database enums declared in supabase/migrations.
 *
 * When a migration adds a value, add it here too: the union types are what
 * stop a typo reaching the database as a silent no-op.
 */

export type AppRole =
  | 'super_admin'
  | 'university_admin'
  | 'registrar'
  | 'department_admin'
  | 'issuer_officer'
  | 'verifier'
  | 'staff'
  | 'student'
  | 'guard'
  | 'librarian';

export type RecordStatus = 'active' | 'inactive';

export type LocationType = 'gate' | 'library' | 'office';

export type CampusEventType =
  | 'IDENTITY_VERIFIED'
  | 'IDENTITY_REJECTED'
  | 'LIBRARY_ENTRY'
  | 'BOOK_ISSUED'
  | 'BOOK_RETURNED'
  | 'NOTIFICATION_SENT'
  | 'CARD_ISSUED'
  | 'CARD_BLOCKED';

export type CampusEventResult =
  | 'VALID'
  | 'INVALID'
  | 'REVOKED'
  | 'EXPIRED'
  | 'SUCCESS'
  | 'FAILED'
  | 'SENT';

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  university_admin: 'University Admin',
  registrar: 'Registrar',
  department_admin: 'Department Admin',
  issuer_officer: 'Issuing Officer',
  verifier: 'Verifier',
  staff: 'Staff',
  student: 'Student',
  guard: 'Guard',
  librarian: 'Librarian',
};

export const EVENT_LABELS: Record<CampusEventType, string> = {
  IDENTITY_VERIFIED: 'Identity Verified',
  IDENTITY_REJECTED: 'Identity Rejected',
  LIBRARY_ENTRY: 'Library Entry',
  BOOK_ISSUED: 'Book Issued',
  BOOK_RETURNED: 'Book Returned',
  NOTIFICATION_SENT: 'Notification Sent',
  CARD_ISSUED: 'Card Issued',
  CARD_BLOCKED: 'Card Blocked',
};

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  gate: 'Gate',
  library: 'Library',
  office: 'Office',
};

/**
 * Roles an administrator can hand out from the Users screen.
 *
 * Each one leads somewhere that works today: guards, librarians and verifiers
 * get the scan console, administrators get the dashboard. Roles belonging to
 * subsystems nobody has built yet are deliberately not offered.
 */
export const ASSIGNABLE_ROLES = ['guard', 'librarian', 'verifier', 'university_admin'] as const;

/** Roles that make no sense without a gate or library to stand at. */
export const POSTED_ROLES = ['guard', 'librarian', 'verifier'] as const;

/** Results that mean the thing being recorded did not succeed. */
export const FAILED_RESULTS: CampusEventResult[] = ['INVALID', 'REVOKED', 'EXPIRED', 'FAILED'];
