import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

/**
 * Supabase client bound to the signed-in staff member.
 *
 * Everything the dashboard reads or writes goes through this client, so row
 * level security decides what is visible. The service role client in admin.ts
 * is the only way past that, and it is used in exactly two places.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components cannot set cookies. The middleware refreshes
            // the session on every request, so nothing is lost here.
          }
        },
      },
    },
  );
}
