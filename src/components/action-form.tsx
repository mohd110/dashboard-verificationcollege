'use client';

import type { ReactNode } from 'react';
import { useActionState } from 'react';

import { idleState, type FormAction } from '@/lib/action-state';

/**
 * A form wired to a server action, with its own pending state and its own
 * message line. Each instance keeps its result to itself, so deactivating one
 * user does not flash a message next to another.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  variant = 'primary',
  hidden,
  children,
  className,
}: {
  action: FormAction;
  submitLabel: string;
  pendingLabel?: string;
  variant?: 'primary' | 'quiet';
  hidden?: Record<string, string>;
  children?: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);

  const button =
    variant === 'primary'
      ? 'rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60'
      : 'rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-60';

  return (
    <form action={formAction} className={className}>
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}

      {children}

      <button
        type="submit"
        disabled={pending}
        className={button}
      >
        {pending ? (pendingLabel ?? 'Working…') : submitLabel}
      </button>

      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-bad">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p className="mt-2 text-sm text-ok">{state.message}</p> : null}
    </form>
  );
}
