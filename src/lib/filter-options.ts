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
      .select('id, full_name, person_code')
      .eq('person_type', 'student')
      .order('full_name'),
    supabase.from('campus_locations').select('id, name').order('name'),
    supabase.from('app_users').select('id, full_name').order('full_name'),
  ]);

  return {
    students: (people.data ?? []).map((person) => ({
      value: person.id,
      label: `${person.full_name} · ${person.person_code}`,
    })),
    locations: (locations.data ?? []).map((location) => ({
      value: location.id,
      label: location.name,
    })),
    actors: (staff.data ?? []).map((member) => ({
      value: member.id,
      label: member.full_name,
    })),
  };
}
