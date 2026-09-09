import 'server-only';

import { createClient } from '@supabase/supabase-js';

/**
 * Service role client. Bypasses row level security completely.
 *
 * Creating a staff login is the only thing that genuinely needs it, because a
 * new account has to be written into auth.users. Every caller must check that
 * the requester is an administrator of the tenant it is about to touch, since
 * no policy will do that checking for it.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set, so staff accounts cannot be created.',
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
