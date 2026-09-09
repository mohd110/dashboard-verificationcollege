import { redirect } from 'next/navigation';

import { homePathFor, requireStaffSession } from '@/lib/session';

/** Sends each role to the one screen it actually works in. */
export default async function RootPage() {
  const session = await requireStaffSession();
  redirect(homePathFor(session));
}
