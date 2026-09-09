'use client';

import { useActionState, useEffect, useRef } from 'react';

import { idleScan, submitScan, type ScanState } from './actions';

const TONE = {
  accepted: 'border-ok bg-ok-light text-ok',
  rejected: 'border-bad bg-bad-light text-bad',
  blocked: 'border-warn bg-warn-light text-warn',
} as const;

function ScanResult({ state }: { state: ScanState }) {
  if (state.outcome === 'idle') {
    return (
      <div className="rounded-lg border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
        Waiting for a scan.
      </div>
    );
  }

  return (
    <div className={`rounded-lg border-2 px-6 py-6 ${TONE[state.outcome]}`} role="status">
      <p className="text-3xl font-bold tracking-tight">{state.headline}</p>

      {state.studentName ? (
        <p className="mt-3 text-xl font-semibold text-ink">
          {state.studentName}
          {state.studentCode ? (
            <span className="ml-2 font-mono text-sm text-muted">{state.studentCode}</span>
          ) : null}
        </p>
      ) : null}

      <p className="mt-2 text-sm">{state.detail}</p>

      {state.chainPosition !== null ? (
        <p className="mt-3 text-xs text-muted">
          Recorded at chain position {state.chainPosition}.
        </p>
      ) : null}

      {state.provisional && state.outcome === 'accepted' ? (
        <p className="mt-2 text-xs font-medium text-warn">
          No digital signature was checked. This event is marked as such in the record.
        </p>
      ) : null}
    </div>
  );
}

export function ScanPanel({ locationName }: { locationName: string }) {
  const [state, formAction, pending] = useActionState(submitScan, idleScan);
  const inputRef = useRef<HTMLInputElement>(null);

  // A reader fires the next scan straight into the field, so focus has to come
  // back on its own once a result is on screen.
  useEffect(() => {
    if (!pending) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [pending, state]);

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-3">
        <label htmlFor="payload" className="block text-sm font-medium text-ink">
          Scan a student card at {locationName}
        </label>
        <input
          id="payload"
          name="payload"
          ref={inputRef}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="Present the card, or type the student ID"
          className="scan-field w-full rounded-lg border border-line bg-surface px-4 py-4 font-mono text-lg focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? 'Checking…' : 'Verify'}
        </button>
      </form>

      <ScanResult state={state} />
    </div>
  );
}
