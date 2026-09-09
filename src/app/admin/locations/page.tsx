import { ActionForm } from '@/components/action-form';
import { Card, DataTable, EmptyState, PageHeading, StatusPill } from '@/components/ui';
import { requireAdminSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { LOCATION_TYPE_LABELS, type LocationType } from '@/lib/types';

import { createLocation, setLocationStatus } from './actions';

export const metadata = { title: 'Locations · GBPUAT Smart Identity' };

type LocationRow = {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  status: 'active' | 'inactive';
  user_roles: { count: number }[];
};

const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none';

export default async function LocationsPage() {
  await requireAdminSession();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('campus_locations')
    .select('id, code, name, type, status, user_roles ( count )')
    .order('name');

  if (error) throw new Error(error.message);
  const locations = (data ?? []) as unknown as LocationRow[];

  return (
    <>
      <PageHeading
        title="Locations"
        description="Gates, libraries and offices where an identity can be presented."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <Card title={`${locations.length} ${locations.length === 1 ? 'location' : 'locations'}`}>
          {locations.length === 0 ? (
            <EmptyState>No locations yet. Add the first one on the right.</EmptyState>
          ) : (
            <DataTable head={['Location', 'Code', 'Type', 'Staff posted', 'Status', '']}>
              {locations.map((location) => {
                const active = location.status === 'active';
                const posted = location.user_roles?.[0]?.count ?? 0;

                return (
                  <tr key={location.id} className="hover:bg-canvas">
                    <td className="px-5 py-3 font-medium">{location.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{location.code}</td>
                    <td className="px-5 py-3">{LOCATION_TYPE_LABELS[location.type]}</td>
                    <td className="px-5 py-3 tabular-nums">{posted}</td>
                    <td className="px-5 py-3">
                      <StatusPill active={active} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <ActionForm
                        action={setLocationStatus}
                        variant="quiet"
                        submitLabel={active ? 'Deactivate' : 'Reactivate'}
                        hidden={{
                          id: location.id,
                          status: active ? 'inactive' : 'active',
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </Card>

        <Card title="Add a location">
          <ActionForm
            action={createLocation}
            submitLabel="Add location"
            pendingLabel="Adding…"
            className="space-y-4 px-5 py-5"
          >
            <div>
              <label htmlFor="name" className="block text-sm font-medium">
                Name
              </label>
              <input id="name" name="name" required placeholder="Gate 3" className={`mt-1 ${inputClass}`} />
            </div>

            <div>
              <label htmlFor="code" className="block text-sm font-medium">
                Code
              </label>
              <input
                id="code"
                name="code"
                required
                placeholder="GATE-3"
                className={`mt-1 ${inputClass}`}
              />
              <p className="mt-1 text-xs text-muted">Letters, numbers and hyphens. Unique on campus.</p>
            </div>

            <div>
              <label htmlFor="type" className="block text-sm font-medium">
                Type
              </label>
              <select id="type" name="type" defaultValue="gate" className={`mt-1 ${inputClass}`}>
                <option value="gate">Gate</option>
                <option value="library">Library</option>
                <option value="office">Office</option>
              </select>
              <p className="mt-1 text-xs text-muted">
                A gate records identity verifications. A library records entries.
              </p>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
