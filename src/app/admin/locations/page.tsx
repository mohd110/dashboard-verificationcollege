import { ActionForm } from '@/components/action-form';
import {
  Card,
  DataTable,
  EmptyState,
  Field,
  PageHeading,
  Row,
  StatusPill,
  inputClass,
} from '@/components/ui';
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
        description="Gates, libraries and other places where an identity can be presented."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_21rem] lg:items-start">
        <Card title={`${locations.length} ${locations.length === 1 ? 'location' : 'locations'}`}>
          {locations.length === 0 ? (
            <EmptyState title="No locations yet">
              Add the first one on the right. A guard cannot be posted anywhere until one exists.
            </EmptyState>
          ) : (
            <DataTable head={['Location', 'Code', 'Type', 'Staff posted', 'Status', '']}>
              {locations.map((location) => {
                const active = location.status === 'active';
                const posted = location.user_roles?.[0]?.count ?? 0;

                return (
                  <Row key={location.id}>
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
                        hidden={{ id: location.id, status: active ? 'inactive' : 'active' }}
                      />
                    </td>
                  </Row>
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
            full
            className="space-y-4 px-5 py-5"
          >
            <Field label="Name" htmlFor="name">
              <input id="name" name="name" required placeholder="Gate 3" className={inputClass} />
            </Field>

            <Field
              label="Code"
              htmlFor="code"
              hint="Letters, numbers and hyphens. Unique on campus."
            >
              <input id="code" name="code" required placeholder="GATE-3" className={inputClass} />
            </Field>

            <Field
              label="Type"
              htmlFor="type"
              hint="A gate records identity verifications. A library records entries."
            >
              <select id="type" name="type" defaultValue="gate" className={inputClass}>
                {(Object.keys(LOCATION_TYPE_LABELS) as LocationType[]).map((type) => (
                  <option key={type} value={type}>
                    {LOCATION_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
