import 'server-only';

import { recordCampusEvent as writeCampusEvent } from '@/lib/events';

import type { CampusEventPayload, CampusEventResultEnvelope, RecordedEvent } from './types';

/**
 * The library's write path into the campus activity log.
 *
 * The library application arrived with its own copy of this, calling
 * record_campus_event directly. It now delegates to lib/events, which makes
 * exactly the same call. One write path means one place where the argument
 * list can go wrong, and it is the same path the gate console and the admin
 * dashboard already use — which is why a book issued in the library shows up
 * in the activity trail without either side knowing about the other.
 *
 * Nothing here computes a hash. The chain is sealed by a trigger inside the
 * database, and the actor and university come from auth.uid() rather than from
 * these arguments, so a caller cannot write activity into another university
 * or under somebody else's name.
 */
export async function recordCampusEvent(payload: CampusEventPayload): Promise<RecordedEvent> {
  return writeCampusEvent({
    eventType: payload.eventType,
    result: payload.result,
    personId: payload.personId,
    locationId: payload.locationId,
    entityType: payload.entityType,
    entityId: payload.entityId,
    metadata: payload.metadata,
    occurredAt:
      payload.occurredAt instanceof Date
        ? payload.occurredAt
        : payload.occurredAt
          ? new Date(payload.occurredAt)
          : undefined,
    systemActor: payload.systemActor,
  });
}

/**
 * The same write, for the places where a failed event must not undo work that
 * has already happened. A book that has been handed over is still issued even
 * if the log write fails; the error is surfaced rather than swallowed silently.
 */
export async function tryRecordCampusEvent(
  payload: CampusEventPayload,
): Promise<CampusEventResultEnvelope> {
  try {
    return { success: true, event: await recordCampusEvent(payload) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[CampusEvents] ${payload.eventType} was not recorded: ${message}`);
    return { success: false, error: message };
  }
}
