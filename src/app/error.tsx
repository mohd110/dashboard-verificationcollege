'use client';

/**
 * Last line of defence. The message is not shown, because a database error can
 * carry table and column names, but the digest is, so a report can be matched
 * against the server log.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          This screen could not be loaded. Nothing was recorded or changed.
        </p>

        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-muted">Reference {error.digest}</p>
        ) : null}

        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
