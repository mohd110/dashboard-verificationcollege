'use client';

import { useActionState } from 'react';
import { AlertCircle, Loader2, Lock, Mail } from 'lucide-react';

import { signIn, type SignInState } from './actions';

const initialState: SignInState = { error: null };

/**
 * The sign-in form.
 *
 * The look is the library application's, which is why it uses that design
 * system's classes rather than Tailwind utilities — see src/app/lib-scope.css
 * for why they are confined to a .lib-scope wrapper.
 *
 * What it is wired to is unchanged: the same signIn server action as before,
 * so the password never touches client code, the redirect is still validated
 * on the server, and a wrong password still gets the same deliberately vague
 * answer.
 */
export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const message = state.error ?? notice ?? null;

  return (
    <form action={formAction}>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {message ? (
        <div className="alert alert--danger" role="alert">
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{message}</span>
        </div>
      ) : null}

      <div className="form-group">
        <label className="form-label" htmlFor="email">
          Email Address
        </label>
        <div className="search-box">
          <Mail size={15} />
          <input
            id="email"
            name="email"
            type="email"
            className="form-input"
            placeholder="you@northfield.example"
            required
            autoComplete="username"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="password">
          Password
        </label>
        <div className="search-box">
          <Lock size={15} />
          <input
            id="password"
            name="password"
            type="password"
            className="form-input"
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-lg"
        disabled={pending}
        style={{ width: '100%', marginTop: 8 }}
      >
        {pending ? <Loader2 size={16} className="spin" /> : null}
        {pending ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}
