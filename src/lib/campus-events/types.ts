/**
 * The vocabulary record_campus_event() enforces, as the library subsystem
 * names it.
 *
 * The event types and results themselves come from lib/types, which is this
 * project's single mirror of the database vocabulary. Re-exporting rather than
 * redeclaring keeps the library screens and the admin dashboard from drifting
 * apart on what an event may say.
 */

import type { CampusEventResult, CampusEventType } from '@/lib/types';

export type { CampusEventResult, CampusEventType };

/** What a librarian's role is permitted to record. Anything else is refused. */
export const LIBRARIAN_EVENT_TYPES = [
  'IDENTITY_VERIFIED',
  'IDENTITY_REJECTED',
  'LIBRARY_ENTRY',
  'BOOK_ISSUED',
  'BOOK_RETURNED',
  'NOTIFICATION_SENT',
] as const satisfies ReadonlyArray<CampusEventType>;

export interface CampusEventPayload {
  eventType: CampusEventType;
  result: CampusEventResult;
  /** The student the event is about. */
  personId?: string | null;
  locationId?: string | null;
  /** What the event acted on, for instance 'book'. */
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string | Date;
  /**
   * True for machine-generated activity: a turnstile opening, a mailer
   * sending. The event is attributed to the system and the session that drove
   * the machine is kept in the metadata as system_operator_id. Only
   * LIBRARY_ENTRY and NOTIFICATION_SENT accept it.
   *
   * BOOK_ISSUED and BOOK_RETURNED are never system events. A librarian issued
   * the book, and the trail should say so.
   */
  systemActor?: boolean;
}

/** The sealed row, as the database returns it. */
export interface RecordedEvent {
  id: string;
  seq: number;
  eventHash: string;
  prevHash: string;
  occurredAt: string;
}

export interface CampusEventResultEnvelope {
  success: boolean;
  event?: RecordedEvent;
  error?: string;
}
