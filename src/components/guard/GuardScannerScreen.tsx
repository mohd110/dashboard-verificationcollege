'use client';

import React, { useState, useEffect, useRef } from 'react';
import { startScanner, type ScannerHandle } from '@/lib/qr/scanner';

interface GuardScannerScreenProps {
  onVerifyPayload: (payload: string) => void;
  onCancel: () => void;
}

export function GuardScannerScreen({ onVerifyPayload, onCancel }: GuardScannerScreenProps) {
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [starting, setStarting] = useState(true);

  /**
   * On-screen diagnostics.
   *
   * A phone has no console you can reach. When the preview is black there are
   * several very different causes — insecure context, permission refused, no
   * camera, or a stream that is attached but not painting — and they are
   * indistinguishable from the outside. This panel reports which one it is.
   */
  const [diag, setDiag] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<ScannerHandle | null>(null);
  const probeRef = useRef<number | null>(null);

  /**
   * The result callback is held in a ref, and the start effect below has an
   * EMPTY dependency array.
   *
   * This is deliberate and load-bearing. Callers naturally pass an inline
   * arrow or an unmemoised handler, which gets a new identity on every render.
   * If the effect depended on it, every parent state change would tear the
   * camera down and immediately reopen it — a thrash loop whose symptom is a
   * permanently black preview. That is precisely the bug this replaced.
   *
   * Keeping the callback in a ref means the camera opens exactly once, on
   * mount, and cannot be disturbed by how the parent chooses to render.
   */
  const onResultRef = useRef(onVerifyPayload);
  onResultRef.current = onVerifyPayload;

  /**
   * Scanning is delegated to lib/core/qr/scanner.ts, which uses the browser's
   * native BarcodeDetector where available and only falls back to the zxing
   * JavaScript decoder on Safari and Firefox.
   *
   * Three things in there are what make this feel instant rather than sluggish,
   * and all three are easy to lose by calling zxing directly:
   *
   *   1. It requests 1920x1080. Left to its own devices the browser hands back
   *      640x480, in which a 34 mm QR is a few dozen pixels across — too few
   *      for any decoder to read.
   *   2. It asks for the REAR camera. The default picks whatever is listed
   *      first, which on a phone is the selfie camera.
   *   3. It enables continuous autofocus, so a card held close to the lens
   *      actually comes into focus.
   *
   * Please do not replace this with a direct decodeFromVideoDevice() call.
   */
  useEffect(() => {
    let cancelled = false;
    const note = (line: string) =>
      !cancelled && setDiag((previous) => [...previous, line]);

    (async () => {
      note(`secure=${typeof window !== 'undefined' && window.isSecureContext}`);
      note(`mediaDevices=${!!navigator.mediaDevices?.getUserMedia}`);
      note(`native=${typeof window !== 'undefined' && !!window.BarcodeDetector}`);

      if (!videoRef.current) {
        note('video element MISSING');
        setStarting(false);
        setErrorMsg('Internal error: no video element.');
        return;
      }

      try {
        const handle = await startScanner({
          video: videoRef.current,
          onResult: (text) => {
            if (cancelled) return;
            // startScanner stops itself before calling back, so there is no
            // window in which a second frame can double-submit.
            scannerRef.current = null;
            onResultRef.current(text);
          },
        });

        if (cancelled) {
          handle.stop();
          return;
        }
        scannerRef.current = handle;
        setHasTorch(handle.hasTorch);
        setStarting(false);
        note(`engine=${handle.engine} ${handle.resolution.width}x${handle.resolution.height}`);
        note(`lens=${handle.facing}${handle.label ? ' · ' + handle.label.slice(0, 28) : ''}`);

        // Poll the element itself. A stream can be attached and still not be
        // painting — this is what distinguishes "camera refused" from "camera
        // running but the <video> is not rendering it".
        const video = videoRef.current;
        const probe = window.setInterval(() => {
          if (cancelled || !video) return;
          setDiag((previous) => [
            ...previous.filter((l) => !l.startsWith('video:')),
            `video: ready=${video.readyState} ${video.videoWidth}x${video.videoHeight} paused=${video.paused} tracks=${(video.srcObject as MediaStream | null)?.getVideoTracks().length ?? 0}`,
          ]);
        }, 700);
        probeRef.current = probe;
      } catch (error) {
        if (!cancelled) {
          setStarting(false);
          const message = (error as Error)?.message ?? String(error);
          note(`FAILED: ${message}`);
          setErrorMsg(message || 'Camera unavailable. Use Manual Entry below.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (probeRef.current) window.clearInterval(probeRef.current);
      scannerRef.current?.stop();
      scannerRef.current = null;
    };
    // Empty on purpose — see onResultRef above. Adding onVerifyPayload here
    // reintroduces the camera thrash loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Reflect what the torch ACTUALLY did, not what we asked for. */
  const toggleTorch = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    const achieved = await scanner.setTorch(!torchOn);
    setTorchOn(achieved);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      onVerifyPayload(manualInput.trim());
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: '#000000',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Scanner Header Controls */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          padding: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
        }}
      >
        <button
          onClick={onCancel}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            backdropFilter: 'blur(8px)',
            border: 'none',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
            close
          </span>
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#88CFF8', fontWeight: 'bold' }}>
            High-Speed Optical Scanner
          </div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#ffffff' }}>Align Student QR Code</div>
        </div>

        <button
          onClick={toggleTorch}
          disabled={!hasTorch}
          title={hasTorch ? 'Toggle torch' : 'This device has no controllable torch'}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            opacity: hasTorch ? 1 : 0.35,
            cursor: hasTorch ? 'pointer' : 'not-allowed',
            background: torchOn ? '#C89D42' : 'rgba(255,255,255,0.2)',
            backdropFilter: 'blur(8px)',
            border: 'none',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
            {torchOn ? 'flash_on' : 'flash_off'}
          </span>
        </button>
      </div>

      {/* Camera Video Feed */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            background: '#000000',
          }}
        />

        {/* Live diagnostics. Sits above the dimming reticle so it is readable
            even when the camera is not painting. Remove once the camera is
            confirmed working on real hardware. */}
        <div
          style={{
            position: 'absolute',
            left: '8px',
            right: '8px',
            bottom: '8px',
            zIndex: 30,
            background: 'rgba(0,0,0,0.82)',
            color: '#88CFF8',
            font: "500 11px/1.5 ui-monospace, 'SF Mono', Menlo, monospace",
            padding: '8px 10px',
            borderRadius: '6px',
            pointerEvents: 'none',
            maxHeight: '38%',
            overflow: 'auto',
          }}
        >
          <div style={{ color: '#C89D42', fontWeight: 700, marginBottom: '4px' }}>
            CAMERA DIAGNOSTICS
          </div>
          {diag.length === 0 ? <div>starting…</div> : diag.map((line, i) => <div key={i}>{line}</div>)}
        </div>

        {/* A black rectangle is ambiguous: starting up, or broken? Say which. */}
        {starting && !errorMsg && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              color: '#88CFF8',
              zIndex: 5,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '40px', animation: 'scanPulse 1.4s ease-in-out infinite' }}
            >
              photo_camera
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Starting camera…</span>
          </div>
        )}

        {/* Scanner Target Reticle Box */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '260px',
            height: '260px',
            border: '3px solid #88CFF8',
            borderRadius: '24px',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '12px',
          }}
        >
          {/* Animated Scan Line */}
          <div
            style={{
              height: '3px',
              background: 'linear-gradient(90deg, transparent 0%, #88CFF8 50%, transparent 100%)',
              boxShadow: '0 0 12px #88CFF8',
              animation: 'scanLine 2.2s ease-in-out infinite',
            }}
          />
        </div>

        {errorMsg && (
          <div
            style={{
              position: 'absolute',
              top: '100px',
              left: '20px',
              right: '20px',
              background: 'rgba(220, 38, 38, 0.9)',
              color: '#ffffff',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '13px',
              textAlign: 'center',
              backdropFilter: 'blur(8px)',
            }}
          >
            {errorMsg}
          </div>
        )}
      </div>

      {/* Bottom Control Drawer */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          padding: '20px',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <button
          onClick={() => setShowManualModal(true)}
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#ffffff',
            padding: '12px 24px',
            borderRadius: '24px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            edit_note
          </span>
          <span>Paste QR Code / Compact JWS</span>
        </button>

        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
          CR80 Verification Engine v4.2 · GBPUAT Gate Scanner
        </span>
      </div>

      {/* Manual Payload Input Overlay Modal */}
      {showManualModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            background: 'rgba(14, 41, 75, 0.95)',
            backdropFilter: 'blur(16px)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ maxWidth: '400px', width: '100%', margin: '0 auto', background: '#0E294B', border: '1px solid #1e293b', padding: '24px', borderRadius: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 8px', color: '#ffffff' }}>
              Manual Payload Entry
            </h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 16px' }}>
              Paste raw compact JWS token payload extracted from student QR code:
            </p>

            <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <textarea
                rows={4}
                placeholder="eyJhbGciOiJFZERTQSI..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: '#13335f',
                  border: '1px solid #334155',
                  color: '#ffffff',
                  fontFamily: "'IBM Plex Sans', monospace",
                  fontSize: '12px',
                }}
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#334155',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!manualInput.trim()}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Verify Token
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes scanLine {
          0% { transform: translateY(0); }
          50% { transform: translateY(230px); }
          100% { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
