'use client';

import type { ReactNode } from 'react';
import { useActionState } from 'react';

import { idleState, type FormAction } from '@/lib/action-state';
import { buttonClass } from '@/components/ui';

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
  full = false,
}: {
  action: FormAction;
  submitLabel: string;
  pendingLabel?: string;
  variant?: 'primary' | 'quiet' | 'danger';
  hidden?: Record<string, string>;
  children?: ReactNode;
  className?: string;
  /** Stretches the button across the form, for a panel rather than a row. */
  full?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);

  const styles = {
    primary: buttonClass.primary,
    danger: buttonClass.danger,
    quiet:
      'inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[0.8125rem] font-medium text-ink-soft transition-colors hover:bg-canvas disabled:opacity-60',
  } as const;

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
        className={`${styles[variant]} ${full ? 'w-full' : ''}`}
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
