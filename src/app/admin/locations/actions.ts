'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { ActionState } from '@/lib/action-state';
import { assertAdminForAction } from '@/lib/session';
import { createServiceClient } from '@/lib/supabase/server';

/*
  Why the service role here.

  Migration 0105 gives campus_locations its admin insert and update policies,
  and it was deliberately left out when the campus migrations were applied to
  the live database. So the table has a read policy and nothing else: an
  administrator's insert was refused outright, and — worse — an update matched
  zero rows under row level security and came back as a success. "Location
  deactivated" was shown for a location that had not changed.

  Rather than depend on a migration nobody has run, these writes check the
  caller is an administrator first and then go through the service role,
  pinned to the administrator's own university on every statement. Applying
  0105 later changes nothing here.
*/

const newLocation = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Give the location a short code.')
    .max(24)
    .regex(/^[A-Za-z0-9-]+$/, 'The code may use letters, numbers and hyphens only.'),
  name: z.string().trim().min(2, 'Give the location a name.').max(80),
  // The live campus_location_type enum. 'office' was offered here and is not
  // one of its values, so every attempt to add one failed at the database.
  type: z.enum(['gate', 'library', 'hostel', 'lab', 'general']),
});

export async function createLocation(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertAdminForAction();

  const parsed = newLocation.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    type: formData.get('type'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, message: null };
  }

  const supabase = await createServiceClient();
  const { error } = await supabase.from('campus_locations').insert({
    // Taken from the session, never from the form, so a crafted request cannot
    // add a location to another campus.
    university_id: session.universityId,
    code: parsed.data.code.toUpperCase(),
    name: parsed.data.name,
    type: parsed.data.type,
  });

  if (error) {
    const duplicate = error.code === '23505';
    return {
      error: duplicate ? 'That code is already in use on this campus.' : error.message,
      message: null,
    };
  }

  revalidatePath('/admin/locations');
  return { error: null, message: `${parsed.data.name} added.` };
}

const statusChange = z.object({
  id: z.uuid(),
  status: z.enum(['active', 'inactive']),
});

/**
 * Locations are never deleted. History points at them, so one that is no longer
 * in use is deactivated instead.
 */
export async function setLocationStatus(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertAdminForAction();

  const parsed = statusChange.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  });

  if (!parsed.success) {
    return { error: 'That location could not be updated.', message: null };
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from('campus_locations')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id)
    .eq('university_id', session.universityId)
    .select('id');

  if (error) return { error: error.message, message: null };

  // Zero rows is a failure, not a success. Reporting it as one is exactly the
  // bug this replaced.
  if (!data || data.length === 0) {
    return { error: 'That location is not on this campus.', message: null };
  }

  revalidatePath('/admin/locations');
  return {
    error: null,
    message: parsed.data.status === 'active' ? 'Location reactivated.' : 'Location deactivated.',
  };
}
