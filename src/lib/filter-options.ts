import type { FilterOption } from '@/components/event-filters';
import { createClient } from '@/lib/supabase/server';

/** Dropdown contents for the activity and verification filters. */
export async function loadFilterOptions(): Promise<{
  students: FilterOption[];
  locations: FilterOption[];
  actors: FilterOption[];
}> {
  const supabase = await createClient();

  const [people, locations, staff] = await Promise.all([
    supabase
      .from('people')
      .select('id, full_name, student_id')
      .eq('role', 'student')
      .order('full_name'),
    supabase.from('campus_locations').select('id, name').order('name'),
    supabase.from('app_users').select('id, display_name').order('display_name'),
  ]);

  return {
    students: (people.data ?? []).map((person) => ({
      value: person.id,
      label: `${person.full_name} · ${person.student_id}`,
    })),
    locations: (locations.data ?? []).map((location) => ({
      value: location.id,
      label: location.name,
    })),
    actors: (staff.data ?? []).map((member) => ({
      value: member.id,
      label: member.display_name,
    })),
  };
}
