'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Camera, CameraOff, CheckCircle, Keyboard, Loader2, ScanLine, ShieldAlert, XCircle,
} from 'lucide-react';

import { submitScan } from '@/actions/library/scan';
import { idleScan, type ScannedStudent, type ScanState } from '@/actions/library/scan-state';

/**
 * Identifying a student at the desk.
 *
 * A card's QR code holds a compact JWS and nothing else, so verification is
 * arithmetic against a key the server already holds. This component only has
 * to get the string off the card and into the action — by camera, by hardware
 * reader, or by hand — and then show what was and was not checked.
 *
 * The decisive rule is at the bottom of this file: a lookup with no signature
 * behind it never gets a green tick.
 */

type Mode = 'camera' | 'manual';

// ─── Camera ────────────────────────────────────────────────────────────────

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

function detectorConstructor(): DetectorConstructor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  return typeof ctor === 'function' ? ctor : null;
}

/** How often a frame is examined. Faster than this only heats the laptop up. */
const FRAME_INTERVAL_MS = 250;

function CameraScanner({
  onRead,
  paused,
  onUnavailable,
}: {
  onRead: (text: string) => void;
  paused: boolean;
  onUnavailable: (reason: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  // The callback and the paused flag are read through refs so that restarting
  // the camera is never a side effect of the parent re-rendering. They are
  // written in an effect rather than during render, because a ref written
  // during render is not a value React can be relied on to have committed.
  const onReadRef = useRef(onRead);
  const pausedRef = useRef(paused);

  useEffect(() => { onReadRef.current = onRead; }, [onRead]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const Ctor = detectorConstructor();
    if (!Ctor) {
      onUnavailable(
        'This browser cannot read a QR code from a camera. Use a hardware reader, or type the printed number.',
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onUnavailable('This browser gives no camera access. Camera scanning needs an https address.');
      return;
    }

    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const detector = new Ctor({ formats: ['qr_code'] });

    // The same card sits in front of the lens for many frames. Reading it once
    // and ignoring the repeats stops a single presentation firing a dozen scans.
    let lastText = '';
    let lastAt = 0;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);
        timer = window.setInterval(tick, FRAME_INTERVAL_MS);
      } catch (err) {
        const name = (err as { name?: string }).name;
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was refused. Allow it in the browser, or type the printed number.'
            : name === 'NotFoundError'
              ? 'No camera was found on this machine.'
              : 'The camera could not be started.',
        );
      }
    }

    async function tick() {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || pausedRef.current) return;
      try {
        const codes = await detector.detect(video);
        const text = codes[0]?.rawValue?.trim();
        if (!text) return;

        const now = Date.now();
        if (text === lastText && now - lastAt < 4000) return;
        lastText = text;
        lastAt = now;

        onReadRef.current(text);
      } catch {
        // A frame that cannot be decoded is the normal case, not an error.
      }
    }

    start();

    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onUnavailable]);

  if (error) {
    return (
      <div className="alert alert--warning" style={{ marginBottom: 0 }}>
        <CameraOff size={14} />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative', borderRadius: 12, overflow: 'hidden',
        background: '#0f172a', aspectRatio: '4 / 3', maxHeight: 320,
      }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {/* A frame to aim with. Purely a target for the person holding the card. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: '14% 22%', borderRadius: 10,
          border: '2px solid rgba(255,255,255,0.85)',
          boxShadow: '0 0 0 9999px rgba(15,23,42,0.35)',
        }}
      />
      <p
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 10, margin: 0,
          textAlign: 'center', color: 'rgba(255,255,255,0.9)', fontSize: 12,
        }}
      >
        {paused ? 'Paused while the last scan is on screen' : ready ? 'Hold the card’s QR code in the frame' : 'Starting the camera…'}
      </p>
    </div>
  );
}

// ─── Result ────────────────────────────────────────────────────────────────

const TONE = {
  accepted: { border: 'var(--success-border)', bg: 'var(--success-bg)', fg: 'var(--success)', Icon: CheckCircle },
  rejected: { border: 'var(--danger-border)', bg: 'var(--danger-bg)', fg: 'var(--danger)', Icon: XCircle },
  blocked: { border: 'var(--warning-border)', bg: 'var(--warning-bg)', fg: 'var(--warning)', Icon: AlertTriangle },
} as const;

function ScanResult({ state, pending }: { state: ScanState; pending: boolean }) {
  if (pending) {
    return (
      <div style={{ border: '2px dashed var(--gray-200)', borderRadius: 12, padding: '28px 20px', textAlign: 'center' }}>
        <Loader2 size={24} className="spin" color="var(--gray-400)" />
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--gray-500)' }}>Checking the signature…</p>
      </div>
    );
  }

  // Anything that is not a known outcome falls back to the waiting state rather
  // than throwing. This is the panel a librarian stands in front of all day,
  // and a blank error there is worse than a stale prompt.
  const tone = TONE[state?.outcome as keyof typeof TONE];

  if (!tone) {
    return (
      <div style={{ border: '2px dashed var(--gray-200)', borderRadius: 12, padding: '28px 20px', textAlign: 'center' }}>
        <ScanLine size={26} color="var(--gray-400)" />
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--gray-500)' }}>Waiting for a card.</p>
      </div>
    );
  }

  const { Icon } = tone;

  return (
    <div
      role="status"
      style={{ border: `2px solid ${tone.border}`, background: tone.bg, borderRadius: 12, padding: '18px 20px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={26} color={tone.fg} style={{ flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: tone.fg, letterSpacing: '-0.01em' }}>
          {state.headline}
        </p>
      </div>

      {state.student && (
        <p style={{ margin: '14px 0 0', fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>
          {state.student.full_name}
          {state.student.student_id && (
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, color: 'var(--gray-500)', fontFamily: 'ui-monospace, monospace' }}>
              {state.student.student_id}
            </span>
          )}
          {state.student.department && (
            <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--gray-500)' }}>
              {state.student.department}
            </span>
          )}
        </p>
      )}

      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--gray-600)' }}>{state.detail}</p>

      {state.chainPosition !== null && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--gray-400)' }}>
          Recorded at chain position {state.chainPosition}.
        </p>
      )}

      {/*
        The one rule that must never bend. A number found on the register says
        nothing about the card that was presented, so it does not get a tick.
      */}
      {state.outcome === 'accepted' && !state.signatureChecked && (
        <p style={{ margin: '10px 0 0', display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, fontWeight: 600, color: 'var(--warning)' }}>
          <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          No digital signature was checked. The record says so, and this is not proof of a genuine card.
        </p>
      )}
    </div>
  );
}

// ─── The scanner ───────────────────────────────────────────────────────────

export default function CardScanner({
  onIdentified,
  allowPrintedNumber = true,
  locationName = 'Central Library',
}: {
  /** Omit on a desk that only checks cards and issues nothing. */
  onIdentified?: (student: ScannedStudent, signatureChecked: boolean) => void;
  allowPrintedNumber?: boolean;
  locationName?: string;
}) {
  const [state, formAction, pending] = useActionState(submitScan, idleScan);
  const [mode, setMode] = useState<Mode>('camera');
  const [cameraNote, setCameraNote] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUnavailable = useCallback((reason: string) => {
    setCameraNote(reason);
    setMode('manual');
  }, []);

  // A camera read goes straight through the same form the reader types into,
  // so there is one submission path and one place a scan can be checked.
  const handleRead = useCallback((text: string) => {
    if (!inputRef.current || !formRef.current) return;
    inputRef.current.value = text;
    formRef.current.requestSubmit();
  }, []);

  // A hardware reader fires the next scan straight into the field, so focus
  // has to return on its own once a result is on screen.
  useEffect(() => {
    if (mode === 'manual' && !pending) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [mode, pending, state.scanId]);

  const student = state.outcome === 'accepted' ? state.student : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className={`btn btn-sm ${mode === 'camera' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setMode('camera')}
        >
          <Camera size={14} /> Camera
        </button>
        <button
          type="button"
          className={`btn btn-sm ${mode === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setMode('manual')}
        >
          <Keyboard size={14} /> Reader or typed
        </button>
      </div>

      {mode === 'camera' && (
        <CameraScanner onRead={handleRead} paused={pending} onUnavailable={handleUnavailable} />
      )}

      {cameraNote && mode === 'manual' && (
        <div className="alert alert--info" style={{ marginBottom: 0 }}>
          <CameraOff size={14} />
          <span>{cameraNote}</span>
        </div>
      )}

      <form ref={formRef} action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label htmlFor="payload" className="form-label" style={{ marginBottom: 0 }}>
          {mode === 'camera'
            ? `Scanning at ${locationName}`
            : `Present the card to a reader at ${locationName}`}
        </label>
        <input
          id="payload"
          name="payload"
          ref={inputRef}
          autoComplete="off"
          spellCheck={false}
          className="form-input"
          style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 15, padding: '12px 14px',
            display: mode === 'camera' ? 'none' : 'block',
          }}
          placeholder={
            allowPrintedNumber
              ? 'Scan the card, or type the printed student number'
              : 'Scan the card'
          }
        />
        {mode === 'manual' && (
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? <><Loader2 size={14} className="spin" /> Checking…</> : 'Verify card'}
          </button>
        )}
      </form>

      <ScanResult state={state} pending={pending} />

      {student && onIdentified && (
        <button
          type="button"
          className="btn btn-success"
          onClick={() => onIdentified(student, state.signatureChecked)}
        >
          Continue with {student.full_name}
        </button>
      )}

      {allowPrintedNumber && mode === 'manual' && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-400)' }}>
          A typed number proves only that the number is on the register. The card itself is not checked,
          and the event records that.
        </p>
      )}

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
