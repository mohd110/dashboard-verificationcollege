import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · GBPUAT Smart Identity' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">
            Pantnagar · Uttarakhand
          </p>
          <h1 className="mt-2 text-xl font-semibold text-brand">
            Govind Ballabh Pant University of Agriculture &amp; Technology
          </h1>
          <p className="mt-1 text-sm text-muted">Smart Identity · Staff sign in</p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6">
          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Demo environment. All student records shown here are fabricated.
        </p>
      </div>
    </main>
  );
}
