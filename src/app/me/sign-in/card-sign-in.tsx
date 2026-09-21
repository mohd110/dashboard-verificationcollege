'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, CameraOff, Check, Keyboard, Loader2, ScanLine } from 'lucide-react';

import { signInWithCard, type StudentSignInState } from '../actions';

const initial: StudentSignInState = { error: null };

/**
 * Signing in by scanning your own card.
 *
 * The camera is the intended path and the textarea is the fallback, for a
 * laptop with no camera or a browser without a barcode decoder. Either way the
 * same signed string reaches the server and gets the same treatment; nothing
 * here decides anything about identity.
 */

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

function detectorConstructor(): DetectorConstructor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  return typeof ctor === 'function' ? ctor : null;
}

/** How often a frame is examined. Faster than this only warms the phone up. */
const FRAME_INTERVAL_MS = 250;

function CameraScanner({ onRead }: { onRead: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    const Ctor = detectorConstructor();

    if (!Ctor) {
      setProblem(
        'This browser cannot decode a QR code. Use the paste option below, or try Chrome.',
      );
      return;
    }

    if (!window.isSecureContext) {
      setProblem(
        'The camera needs a secure connection. Open this page over https, or paste the card below.',
      );
      return;
    }

    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let stopped = false;

    const detector = new Ctor({ formats: ['qr_code'] });
    const canvas = document.createElement('canvas');

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      } catch {
        setProblem('The camera could not be opened. Paste the card contents below instead.');
        return;
      }

      const video = videoRef.current;
      if (!video || stopped) return;

      video.srcObject = stream;
      await video.play().catch(() => {});

      timer = window.setInterval(async () => {
        if (done.current || !video.videoWidth) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) return;

        context.drawImage(video, 0, 0);

        try {
          const [hit] = await detector.detect(canvas);
          if (hit?.rawValue) {
            done.current = true;
            onRead(hit.rawValue);
          }
        } catch {
          // A frame that will not decode is the normal case, not an error.
        }
      }, FRAME_INTERVAL_MS);
    }

    void start();

    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onRead]);

  if (problem) {
    return (
      <div className="pass-alert">
        <CameraOff size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{problem}</span>
      </div>
    );
  }

  return (
    <div className="pass-camera">
      <video ref={videoRef} muted playsInline />
      <div className="pass-camera__reticle" />
    </div>
  );
}

export function CardSignIn() {
  const [state, formAction, pending] = useActionState(signInWithCard, initial);
  const [mode, setMode] = useState<'camera' | 'paste'>('camera');
  const [payload, setPayload] = useState('');

  const handleRead = useCallback((value: string) => {
    setPayload(value);
    setMode('paste');
  }, []);

  const scanned = payload.trim().length > 0;

  return (
    <form action={formAction}>
      <div className="pass-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'camera'}
          className={`pass-tab${mode === 'camera' ? ' pass-tab--on' : ''}`}
          onClick={() => setMode('camera')}
        >
          <Camera size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          Scan card
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'paste'}
          className={`pass-tab${mode === 'paste' ? ' pass-tab--on' : ''}`}
          onClick={() => setMode('paste')}
        >
          <Keyboard size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          Paste
        </button>
      </div>

      {state.error ? (
        <div className="pass-alert" role="alert">
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{state.error}</span>
        </div>
      ) : null}

      {mode === 'camera' ? (
        <CameraScanner onRead={handleRead} />
      ) : (
        <div className="pass-field">
          <label className="pass-label" htmlFor="payload">
            Card contents
          </label>
          <textarea
            id="payload"
            name="payload"
            className="pass-input pass-input--mono"
            placeholder="eyJhbGciOiJFZERTQSIsImtpZCI6…"
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            required
          />
        </div>
      )}

      {mode === 'camera' ? <input type="hidden" name="payload" value={payload} /> : null}

      {scanned && mode === 'camera' ? (
        <p className="pass-note" style={{ color: 'var(--p-ok)', marginTop: 0, marginBottom: 14 }}>
          <Check size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          Card read. Confirm your date of birth to open the pass.
        </p>
      ) : null}

      <div className="pass-field">
        <label className="pass-label" htmlFor="dateOfBirth">
          Date of birth
        </label>
        <input
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          className="pass-input"
          required
          autoComplete="bday"
        />
      </div>

      <button type="submit" className="pass-btn pass-btn--primary" disabled={pending}>
        {pending ? <Loader2 size={15} className="pass-spin" /> : <ScanLine size={15} />}
        {pending ? 'Checking your card…' : 'Open my pass'}
      </button>

      <style>{`.pass-spin{animation:pass-spin 1s linear infinite}@keyframes pass-spin{to{transform:rotate(360deg)}}`}</style>
    </form>
  );
}
