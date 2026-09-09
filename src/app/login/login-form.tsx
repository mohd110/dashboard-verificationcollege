'use client';

import { useActionState } from 'react';

import { signIn, type SignInState } from './actions';

const initialState: SignInState = { error: null };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md bg-bad-light px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
