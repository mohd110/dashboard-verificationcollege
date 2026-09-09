/**
 * Mirrors of the live database vocabulary.
 *
 * app_role, campus_location_type and person_status are real Postgres enums and
 * are reproduced exactly. Campus event types and results are text columns in
 * this database, so the vocabulary is enforced by record_campus_event() and
 * repeated here for the user interface.
 */

export type AppRole =
  // The eight roles that already existed.
  | 'platform_admin'
  | 'university_admin'
  | 'registrar'
  | 'department_admin'
  | 'card_operator'
  | 'revocation_officer'
  | 'verifier'
  | 'auditor'
  // Added for the campus flow.
  | 'guard'
  | 'librarian';

export type LocationType = 'gate' | 'library' | 'hostel' | 'lab' | 'general';

export type PersonStatus = 'active' | 'inactive' | 'archived';

/** Credential lifecycle, owned by the identity subsystem. Read only here. */
export type CredentialState = 'active' | 'suspended' | 'revoked' | 'superseded' | 'expired';

/** Card lifecycle, owned by the identity subsystem. Read only here. */
export type CardStatus =
  | 'requested'
  | 'printed'
  | 'issued'
  | 'collected'
  | 'returned'
  | 'destroyed';

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
  platform_admin: 'Platform Admin',
  university_admin: 'University Admin',
  registrar: 'Registrar',
  department_admin: 'Department Admin',
  card_operator: 'Card Operator',
  revocation_officer: 'Revocation Officer',
  verifier: 'Verifier',
  auditor: 'Auditor',
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
  hostel: 'Hostel',
  lab: 'Laboratory',
  general: 'General',
};

/** Roles the dashboard hands out. Each one leads to a screen that works. */
export const ASSIGNABLE_ROLES = ['guard', 'librarian', 'verifier', 'university_admin'] as const;

/** Roles that make no sense without a gate or library to stand at. */
export const POSTED_ROLES = ['guard', 'librarian', 'verifier'] as const;

/**
 * user_roles carries a scope rather than a location column, so a posting is a
 * role row scoped to one campus location.
 */
export const LOCATION_SCOPE = 'location';

/** Results that mean the thing being recorded did not succeed. */
export const FAILED_RESULTS: CampusEventResult[] = ['INVALID', 'REVOKED', 'EXPIRED', 'FAILED'];
