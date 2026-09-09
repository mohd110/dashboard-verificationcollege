'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { ActionState } from '@/lib/action-state';
import { assertAdminForAction } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ASSIGNABLE_ROLES, POSTED_ROLES } from '@/lib/types';

const newUser = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name.').max(80),
  email: z.email('Enter a valid email address.'),
  role: z.enum(ASSIGNABLE_ROLES),
  locationId: z.union([z.uuid(), z.literal('')]),
  password: z.string().min(12, 'The initial password must be at least 12 characters.'),
});

export async function createStaffUser(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertAdminForAction();

  const parsed = newUser.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    role: formData.get('role'),
    locationId: formData.get('locationId') ?? '',
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, message: null };
  }

  const { fullName, email, role, password } = parsed.data;
  const locationId = parsed.data.locationId || null;

  if ((POSTED_ROLES as readonly string[]).includes(role) && !locationId) {
    return { error: 'Choose the location this person is posted to.', message: null };
  }

  const supabase = await createClient();

  // Confirms the location is on this campus before the service role client,
  // which ignores row level security, is anywhere near the data.
  if (locationId) {
    const { data: location } = await supabase
      .from('campus_locations')
      .select('id, type')
      .eq('id', locationId)
      .maybeSingle();

    if (!location) {
      return { error: 'That location is not on this campus.', message: null };
    }
    if (role === 'librarian' && location.type !== 'library') {
      return { error: 'A librarian has to be posted to a library.', message: null };
    }
  }

  const admin = createAdminClient();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !created.user) {
    const taken = /already been registered|already exists/i.test(authError?.message ?? '');
    return {
      error: taken ? 'Somebody already signs in with that address.' : 'The login could not be created.',
      message: null,
    };
  }

  const userId = created.user.id;

  const { error: profileError } = await admin.from('app_users').insert({
    id: userId,
    university_id: session.universityId,
    full_name: fullName,
    email,
    status: 'active',
  });

  if (profileError) {
    // Leaving a login with no profile behind would let somebody sign in to
    // nothing, so the half-made account is removed.
    await admin.auth.admin.deleteUser(userId);
    return { error: 'The staff record could not be saved.', message: null };
  }

  const { error: roleError } = await admin.from('user_roles').insert({
    user_id: userId,
    university_id: session.universityId,
    role,
    location_id: locationId,
  });

  if (roleError) {
    await admin.from('app_users').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
    return { error: 'The role could not be granted.', message: null };
  }

  revalidatePath('/admin/users');
  return { error: null, message: `${fullName} can now sign in.` };
}

const statusChange = z.object({
  id: z.uuid(),
  status: z.enum(['active', 'inactive']),
});

export async function setUserStatus(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertAdminForAction();

  const parsed = statusChange.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  });

  if (!parsed.success) {
    return { error: 'That account could not be updated.', message: null };
  }

  if (parsed.data.id === session.userId) {
    return { error: 'You cannot deactivate your own account.', message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('app_users')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id);

  if (error) return { error: error.message, message: null };

  revalidatePath('/admin/users');
  return {
    error: null,
    message: parsed.data.status === 'active' ? 'Account reactivated.' : 'Account deactivated.',
  };
}

const postingChange = z.object({
  userId: z.uuid(),
  role: z.enum(ASSIGNABLE_ROLES),
  locationId: z.union([z.uuid(), z.literal('')]),
});

/** Only an administrator moves somebody to a different gate or library. */
export async function setUserPosting(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertAdminForAction();

  const parsed = postingChange.safeParse({
    userId: formData.get('userId'),
    role: formData.get('role'),
    locationId: formData.get('locationId') ?? '',
  });

  if (!parsed.success) {
    return { error: 'That posting could not be saved.', message: null };
  }

  const locationId = parsed.data.locationId || null;

  if ((POSTED_ROLES as readonly string[]).includes(parsed.data.role) && !locationId) {
    return { error: 'This role has to be posted somewhere.', message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('user_roles')
    .update({ location_id: locationId })
    .eq('user_id', parsed.data.userId)
    .eq('role', parsed.data.role);

  if (error) return { error: error.message, message: null };

  revalidatePath('/admin/users');
  return { error: null, message: 'Posting updated.' };
}
