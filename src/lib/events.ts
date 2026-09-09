import { createClient } from '@/lib/supabase/server';
import type { AppRole, CampusEventResult, CampusEventType, LocationType } from '@/lib/types';

/**
 * The campus activity log.
 *
 * This module is the integration point named in the team handoff. Saif records
 * identity outcomes through it, Tabish records book and notification activity
 * through it, and neither of them writes to the table directly: every insert
 * goes through the record_campus_event function, which seals the hash chain
 * and takes the actor and the university from the session rather than from its
 * arguments.
 */

export type RecordEventInput = {
  eventType: CampusEventType;
  result: CampusEventResult;
  /** The student the event is about. */
  personId?: string | null;
  locationId?: string | null;
  /** What the event acted on, for instance 'book'. */
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
  /**
   * True for machine-generated activity: a turnstile opening, a mailer sending.
   * The event is then attributed to the system, and the session that drove the
   * machine is kept in the metadata. Only LIBRARY_ENTRY and NOTIFICATION_SENT
   * accept it; anything else is rejected by the database.
   */
  systemActor?: boolean;
};

export type RecordedEvent = {
  id: string;
  seq: number;
  eventHash: string;
  prevHash: string;
  occurredAt: string;
};

export type EventActor = { id: string; fullName: string } | null;
export type EventPerson = { id: string; fullName: string; personCode: string } | null;
export type EventLocation = { id: string; name: string; code: string; type: LocationType } | null;

export type CampusEvent = {
  id: string;
  seq: number;
  eventType: CampusEventType;
  result: CampusEventResult;
  occurredAt: string;
  actorRole: AppRole | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  prevHash: string;
  eventHash: string;
  person: EventPerson;
  actor: EventActor;
  location: EventLocation;
};

const EVENT_SELECT = `
  id, seq, event_type, result, occurred_at, actor_role, entity_type, entity_id,
  metadata, prev_hash, event_hash,
  people ( id, full_name, person_code ),
  app_users ( id, full_name ),
  campus_locations ( id, name, code, type )
`;

type EventRow = {
  id: string;
  seq: number;
  event_type: CampusEventType;
  result: CampusEventResult;
  occurred_at: string;
  actor_role: AppRole | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  prev_hash: string;
  event_hash: string;
  people: { id: string; full_name: string; person_code: string } | null;
  app_users: { id: string; full_name: string } | null;
  campus_locations: { id: string; name: string; code: string; type: LocationType } | null;
};

function toCampusEvent(row: EventRow): CampusEvent {
  return {
    id: row.id,
    seq: row.seq,
    eventType: row.event_type,
    result: row.result,
    occurredAt: row.occurred_at,
    actorRole: row.actor_role,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata ?? {},
    prevHash: row.prev_hash,
    eventHash: row.event_hash,
    person: row.people
      ? { id: row.people.id, fullName: row.people.full_name, personCode: row.people.person_code }
      : null,
    actor: row.app_users ? { id: row.app_users.id, fullName: row.app_users.full_name } : null,
    location: row.campus_locations,
  };
}

/**
 * Writes one event and returns its sealed position in the chain.
 *
 * Throws with the database's own message when the caller's role may not record
 * this kind of event, or when the location or student belongs to another
 * university.
 */
export async function recordCampusEvent(input: RecordEventInput): Promise<RecordedEvent> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc('record_campus_event', {
      p_event_type: input.eventType,
      p_result: input.result,
      p_person_id: input.personId ?? null,
      p_location_id: input.locationId ?? null,
      p_entity_type: input.entityType ?? null,
      p_entity_id: input.entityId ?? null,
      p_metadata: input.metadata ?? {},
      p_occurred_at: (input.occurredAt ?? new Date()).toISOString(),
      p_system_actor: input.systemActor ?? false,
    })
    .single();

  if (error) throw new Error(error.message);

  const row = data as { id: string; seq: number; event_hash: string; prev_hash: string; occurred_at: string };

  return {
    id: row.id,
    seq: row.seq,
    eventHash: row.event_hash,
    prevHash: row.prev_hash,
    occurredAt: row.occurred_at,
  };
}

export type EventFilters = {
  personId?: string;
  locationId?: string;
  actorId?: string;
  result?: CampusEventResult;
  eventTypes?: CampusEventType[];
  /** Inclusive, as a yyyy-mm-dd date in the viewer's own day. */
  fromDate?: string;
  toDate?: string;
  limit?: number;
};

export async function listCampusEvents(filters: EventFilters = {}): Promise<CampusEvent[]> {
  const supabase = await createClient();

  let query = supabase
    .from('campus_events')
    .select(EVENT_SELECT)
    .order('occurred_at', { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.personId) query = query.eq('person_id', filters.personId);
  if (filters.locationId) query = query.eq('location_id', filters.locationId);
  if (filters.actorId) query = query.eq('actor_id', filters.actorId);
  if (filters.result) query = query.eq('result', filters.result);
  if (filters.eventTypes?.length) query = query.in('event_type', filters.eventTypes);
  if (filters.fromDate) query = query.gte('occurred_at', `${filters.fromDate}T00:00:00`);
  if (filters.toDate) query = query.lte('occurred_at', `${filters.toDate}T23:59:59.999`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data as unknown as EventRow[]).map(toCampusEvent);
}

/** Oldest first, which is how a trail reads. */
export async function listActivityTrail(personId: string): Promise<CampusEvent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('campus_events')
    .select(EVENT_SELECT)
    .eq('person_id', personId)
    .order('occurred_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as unknown as EventRow[]).map(toCampusEvent);
}

export async function getCampusEvent(eventId: string): Promise<CampusEvent | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('campus_events')
    .select(EVENT_SELECT)
    .eq('id', eventId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toCampusEvent(data as unknown as EventRow) : null;
}

export type EventIntegrity = {
  found: boolean;
  seq?: number;
  event_hash?: string;
  prev_hash?: string;
  event_hash_ok?: boolean;
  prev_hash_ok?: boolean;
  record_integrity?: 'VALID' | 'INVALID';
};

export async function checkEventIntegrity(eventId: string): Promise<EventIntegrity> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('verify_campus_event', { p_event_id: eventId });
  if (error) throw new Error(error.message);
  return data as EventIntegrity;
}

export type ChainStatus = {
  events: number;
  status: 'UNBROKEN' | 'BROKEN';
  first_broken_seq: number | null;
  head_hash: string | null;
  checked_at: string;
};

export async function getChainStatus(universityId: string): Promise<ChainStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('campus_event_chain_status', {
    p_university_id: universityId,
  });
  if (error) throw new Error(error.message);
  return data as ChainStatus;
}

export type ChainRow = {
  seq: number;
  event_id: string;
  occurred_at: string;
  event_type: CampusEventType;
  prev_hash_ok: boolean;
  event_hash_ok: boolean;
};

export async function verifyChain(universityId: string): Promise<ChainRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('verify_campus_event_chain', {
    p_university_id: universityId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as ChainRow[];
}
