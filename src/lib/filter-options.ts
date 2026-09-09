import { cache } from 'react';

import type { FilterOption } from '@/components/event-filters';
import { createClient } from '@/lib/supabase/server';

export type FilterOptions = {
  students: FilterOption[];
  locations: FilterOption[];
  actors: FilterOption[];
};

/**
 * Dropdown contents for the activity and verification filters.
 *
 * Cached for the request, because both filter pages ask for it and a Suspense
 * boundary can render more than once. Three queries, run together.
 */
export const loadFilterOptions = cache(async (): Promise<FilterOptions> => {
  const supabase = await createClient();

  const [people, locations, staff] = await Promise.all([
    supabase
      .from('people')
      .select('id, full_name, student_id')
      .eq('role', 'student')
      .order('full_name')
      .limit(500),
    supabase.from('campus_locations').select('id, name').order('name'),
    supabase.from('app_users').select('id, display_name').order('display_name'),
  ]);

  return {
    students: (people.data ?? []).map((person) => ({
      value: person.id,
      // The number is absent on rows created before the register was
      // reconciled, and "Name · null" is worse than just the name.
      label: person.student_id
        ? `${person.full_name} · ${person.student_id}`
        : (person.full_name ?? 'Unnamed'),
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
});
