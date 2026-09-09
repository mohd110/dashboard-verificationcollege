'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { ActionState } from '@/lib/action-state';
import { assertAdminForAction } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const newLocation = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Give the location a short code.')
    .max(24)
    .regex(/^[A-Za-z0-9-]+$/, 'The code may use letters, numbers and hyphens only.'),
  name: z.string().trim().min(2, 'Give the location a name.').max(80),
  type: z.enum(['gate', 'library', 'office']),
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

  const supabase = await createClient();
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
  await assertAdminForAction();

  const parsed = statusChange.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  });

  if (!parsed.success) {
    return { error: 'That location could not be updated.', message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('campus_locations')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id);

  if (error) return { error: error.message, message: null };

  revalidatePath('/admin/locations');
  return {
    error: null,
    message: parsed.data.status === 'active' ? 'Location reactivated.' : 'Location deactivated.',
  };
}
