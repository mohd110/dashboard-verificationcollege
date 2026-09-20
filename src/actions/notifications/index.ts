'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { getLibrarianContext } from '@/lib/auth/librarian';

// ─── Get Notifications ────────────────────────────────────────────────────
export async function getNotifications(limit = 50) {
  const { universityId } = await getLibrarianContext();
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from('notifications')
    .select(`
      id, type, channel, status, recipient_email, subject, sent_at, error, created_at,
      people(full_name, student_id)
    `)
    .eq('university_id', universityId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── Get Notification Stats ───────────────────────────────────────────────
export async function getNotificationStats() {
  const { universityId: uid } = await getLibrarianContext();
  const supabase = await createServiceClient();

  const [
    { count: total },
    { count: sent },
    { count: pending },
    { count: failed },
  ] = await Promise.all([
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('university_id', uid),
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('university_id', uid).eq('status', 'SENT'),
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('university_id', uid).eq('status', 'PENDING'),
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('university_id', uid).eq('status', 'FAILED'),
  ]);

  return { total: total ?? 0, sent: sent ?? 0, pending: pending ?? 0, failed: failed ?? 0 };
}
