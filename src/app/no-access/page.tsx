import { signOut } from '@/app/login/actions';

export const metadata = { title: 'No access · GBPUAT Smart Identity' };

/**
 * For someone who is signed in but cannot be let through: a login that was
 * never linked to a staff record, or an account an administrator switched off.
 */
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const deactivated = reason === 'deactivated';

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">
          {deactivated ? 'This account is deactivated' : 'This account has no access'}
        </h1>

        <p className="mt-2 text-sm text-muted">
          {deactivated
            ? 'An administrator has switched this account off. Ask them to restore it.'
            : 'You are signed in, but this login is not attached to a staff record or a role. An administrator can set that up on the Users screen.'}
        </p>

        <form action={signOut} className="mt-5">
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
