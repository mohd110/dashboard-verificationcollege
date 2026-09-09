import { ActionForm } from '@/components/action-form';
import { Card, DataTable, EmptyState, PageHeading, StatusPill } from '@/components/ui';
import { requireAdminSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import {
  ASSIGNABLE_ROLES,
  POSTED_ROLES,
  ROLE_LABELS,
  type AppRole,
  type LocationType,
} from '@/lib/types';

import { createStaffUser, setUserPosting, setUserStatus } from './actions';

export const metadata = { title: 'Users · GBPUAT Smart Identity' };

type StaffRow = {
  id: string;
  display_name: string;
  status: string;
  auth_user_id: string | null;
  user_roles: { id: string; role: AppRole; location_id: string | null }[];
};

type LocationOption = { id: string; name: string; type: LocationType };

const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none';

export default async function UsersPage() {
  const session = await requireAdminSession();
  const supabase = await createClient();

  const [staffResult, locationResult] = await Promise.all([
    supabase
      .from('app_users')
      .select(
        'id, display_name, status, auth_user_id, user_roles ( id, role, location_id )',
      )
      .order('display_name'),
    supabase
      .from('campus_locations')
      .select('id, name, type')
      .eq('status', 'active')
      .order('name'),
  ]);

  if (staffResult.error) throw new Error(staffResult.error.message);

  const staff = (staffResult.data ?? []) as unknown as StaffRow[];
  const locations = (locationResult.data ?? []) as LocationOption[];
  const locationNames = new Map(locations.map((location) => [location.id, location.name]));

  return (
    <>
      <PageHeading
        title="Users"
        description="Staff accounts, the role each one holds and where they are posted."
      />

      <Card title={`${staff.length} ${staff.length === 1 ? 'account' : 'accounts'}`}>
        {staff.length === 0 ? (
          <EmptyState>No staff accounts yet.</EmptyState>
        ) : (
          <DataTable head={['Name', 'Role', 'Posted to', 'Sign in', 'Status', '']}>
            {staff.map((member) => {
              const grant = member.user_roles?.[0];
              const active = member.status === 'active';
              const canBePosted = grant && (POSTED_ROLES as readonly string[]).includes(grant.role);
              const postedLocationId = grant?.location_id ?? '';

              return (
                <tr key={member.id} className="align-top hover:bg-canvas">
                  <td className="px-5 py-3 font-medium">{member.display_name}</td>
                  <td className="px-5 py-3">{grant ? ROLE_LABELS[grant.role] : '—'}</td>
                  <td className="px-5 py-3">
                    {canBePosted ? (
                      <ActionForm
                        action={setUserPosting}
                        variant="quiet"
                        submitLabel="Save"
                        pendingLabel="Saving…"
                        className="flex items-center gap-2"
                        hidden={{ roleId: grant.id }}
                      >
                        <select
                          name="locationId"
                          defaultValue={postedLocationId}
                          aria-label={`Posting for ${member.display_name}`}
                          className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                        >
                          <option value="">Not posted</option>
                          {locations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name}
                            </option>
                          ))}
                        </select>
                      </ActionForm>
                    ) : (
                      <span className="text-muted">
                        {postedLocationId ? (locationNames.get(postedLocationId) ?? '—') : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {member.auth_user_id ? (
                      <span className="text-xs text-ok">Has a login</span>
                    ) : (
                      <span className="text-xs text-warn">No login yet</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill active={active} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    {member.id === session.userId ? (
                      <span className="text-xs text-muted">This is you</span>
                    ) : (
                      <ActionForm
                        action={setUserStatus}
                        variant="quiet"
                        submitLabel={active ? 'Deactivate' : 'Reactivate'}
                        hidden={{ id: member.id, status: active ? 'inactive' : 'active' }}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Card>

      <div className="mt-6 max-w-md">
        <Card title="Add a staff account">
          <ActionForm
            action={createStaffUser}
            submitLabel="Create account"
            pendingLabel="Creating…"
            className="space-y-4 px-5 py-5"
          >
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium">
                Full name
              </label>
              <input id="fullName" name="fullName" required className={`mt-1 ${inputClass}`} />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className={`mt-1 ${inputClass}`}
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium">
                Role
              </label>
              <select id="role" name="role" defaultValue="guard" className={`mt-1 ${inputClass}`}>
                {ASSIGNABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="locationId" className="block text-sm font-medium">
                Posted to
              </label>
              <select id="locationId" name="locationId" className={`mt-1 ${inputClass}`}>
                <option value="">Not posted</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                Guards, librarians and verifiers must be posted somewhere.
              </p>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                Initial password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={12}
                className={`mt-1 ${inputClass}`}
              />
              <p className="mt-1 text-xs text-muted">
                At least 12 characters. Hand it over in person, not by message.
              </p>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
