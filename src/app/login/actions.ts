'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

const credentials = z.object({
  email: z.email('Enter the email address you were given.'),
  password: z.string().min(1, 'Enter your password.'),
  next: z.string().optional(),
});

export type SignInState = { error: string | null };

export async function signIn(_state: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately vague: saying which half was wrong tells an attacker which
    // addresses are real.
    return { error: 'That email address and password do not match.' };
  }

  // Only same-origin paths, so a crafted link cannot bounce a signed-in member
  // of staff off to somebody else's site.
  const next = parsed.data.next;
  redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
