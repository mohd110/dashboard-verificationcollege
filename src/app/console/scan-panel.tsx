'use client';

import { useActionState, useEffect, useRef } from 'react';
import { CircleAlert, CircleCheck, CircleX, ScanLine } from 'lucide-react';

import { submitScan } from './actions';
import { idleScan, type ScanState } from './scan-state';

const TONE = {
  accepted: {
    frame: 'border-ok bg-ok-light text-ok',
    icon: CircleCheck,
  },
  rejected: {
    frame: 'border-bad bg-bad-light text-bad',
    icon: CircleX,
  },
  blocked: {
    frame: 'border-warn bg-warn-light text-warn',
    icon: CircleAlert,
  },
} as const;

function ScanResult({ state, pending }: { state: ScanState; pending: boolean }) {
  if (pending) {
    return (
      <div className="rounded-xl border-2 border-dashed border-line px-6 py-12 text-center">
        <div className="skeleton mx-auto h-9 w-40" />
        <div className="skeleton mx-auto mt-4 h-5 w-56" />
        <div className="skeleton mx-auto mt-2 h-3.5 w-72 max-w-full" />
      </div>
    );
  }

  // Anything that is not a known outcome falls back to the waiting state
  // rather than throwing. This panel is the one screen a guard stands in front
  // of all day, and a blank error page there is worse than a stale prompt.
  const tone = TONE[state?.outcome as keyof typeof TONE];

  if (!tone) {
    return (
      <div className="rounded-xl border-2 border-dashed border-line px-6 py-12 text-center">
        <ScanLine size={28} className="mx-auto text-faint" />
        <p className="mt-3 text-sm text-muted">Waiting for a scan.</p>
      </div>
    );
  }

  const Icon = tone.icon;

  return (
    <div className={`rounded-xl border-2 px-6 py-6 ${tone.frame}`} role="status">
      <div className="flex items-center gap-3">
        <Icon size={30} className="shrink-0" />
        <p className="text-3xl font-bold tracking-tight">{state.headline}</p>
      </div>

      {state.studentName ? (
        <p className="mt-4 text-xl font-semibold text-ink">
          {state.studentName}
          {state.studentCode ? (
            <span className="ml-2 font-mono text-sm text-muted">{state.studentCode}</span>
          ) : null}
        </p>
      ) : null}

      <p className="mt-2 text-sm">{state.detail}</p>

      {state.chainPosition !== null ? (
        <p className="mt-3 text-xs text-muted">Recorded at chain position {state.chainPosition}.</p>
      ) : null}

      {state.provisional && state.outcome === 'accepted' ? (
        <p className="mt-2 text-xs font-semibold text-warn">
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
  }, [pending, state.scanId]);

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-3">
        <label htmlFor="payload" className="block text-sm font-medium text-ink-soft">
          Scan a student card at {locationName}
        </label>
        <input
          id="payload"
          name="payload"
          ref={inputRef}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="Present the card, or type the student number"
          className="scan-field w-full rounded-xl border border-line bg-surface px-4 py-4 font-mono text-lg focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? 'Checking…' : 'Verify'}
        </button>
      </form>

      <ScanResult state={state} pending={pending} />
    </div>
  );
}
