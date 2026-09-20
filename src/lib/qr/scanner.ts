/**
 * A continuous QR scanner.
 *
 * Reads whatever is in front of the camera, over and over, and calls back the
 * instant it recognises a code — the behaviour people expect from any modern
 * scanner. No button to press.
 *
 * Two engines, picked automatically:
 *
 *   BarcodeDetector — built into the browser, hardware-accelerated. Present in
 *                     Chrome on Android and desktop. This is what makes it feel
 *                     instant.
 *   zxing           — a JavaScript decoder, used where the native one is
 *                     missing (Safari, Firefox). Slower, so it runs on a
 *                     throttle rather than every frame.
 *
 * Deliberately not tied to React so the scanning logic can be tested and
 * reasoned about on its own.
 */

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): BarcodeDetectorLike;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

export type ScanEngine = 'native' | 'zxing';

export interface ScannerHandle {
  stop: () => void;
  engine: ScanEngine;
  /** Resolution actually granted by the camera, for diagnostics. */
  resolution: { width: number; height: number };
  /** Which lens the device actually gave us — 'environment' is the rear one. */
  facing: string;
  /** The camera's own label, where the browser exposes it. */
  label: string;
  /** True when the device exposes a controllable torch. */
  hasTorch: boolean;
  /**
   * Turns the torch on or off. Resolves to the state actually achieved —
   * callers should use the returned value rather than assuming success, since
   * plenty of devices advertise a torch and then refuse to switch it on.
   */
  setTorch: (on: boolean) => Promise<boolean>;
}

export interface ScannerOptions {
  video: HTMLVideoElement;
  onResult: (text: string) => void;
  onError?: (message: string) => void;
  /** How often to run the JS decoder, in ms. Ignored by the native engine. */
  fallbackIntervalMs?: number;
}

/**
 * Asks for the rear camera at the highest resolution it will give us.
 *
 * Resolution matters more than anything else here: a QR printed at 30 mm, or
 * shown on a screen across the room, is only a few dozen pixels across in a
 * 640x480 stream — too few for any decoder. Requesting 1920 and letting the
 * browser downgrade is what makes reading a card at arm's length work.
 */
async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot open a camera.');
  }
  if (!window.isSecureContext) {
    throw new Error(
      'The camera needs a secure connection. Start the server with: npm run dev:https',
    );
  }

  /**
   * Camera selection, hardest case first.
   *
   * iOS Safari IGNORES `facingMode: { ideal: 'environment' }` — it silently
   * hands back the selfie camera, at whatever low resolution it feels like.
   * Measured on an iPhone: 480x640 from the front lens, when 1920x1080 from
   * the rear was requested.
   *
   * `exact` is what actually forces the rear lens. It throws
   * OverconstrainedError on a device with no rear camera, which is why the
   * ladder below exists rather than a single call.
   *
   * Resolution matters more than anything else here: a 34 mm QR in a 480x640
   * frame is a few dozen pixels across — too few for any decoder to read.
   */
  const attempts: MediaStreamConstraints[] = [
    // Force the rear lens at full resolution.
    {
      video: {
        facingMode: { exact: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
    // Rear lens, let the device pick the mode.
    { video: { facingMode: { exact: 'environment' } } },
    // No rear camera (a laptop). Take any, but still ask for resolution.
    { video: { width: { ideal: 1920 }, height: { ideal: 1080 } } },
    { video: true },
  ];

  let lastError: unknown;

  for (const constraints of attempts) {
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true'); // iOS: inline, not fullscreen
      video.setAttribute('autoplay', 'true');
      video.muted = true;

      // Safari can reject play() transiently while the stream settles. A
      // rejection here is not fatal: `autoplay` + `muted` usually starts it
      // anyway, so do not discard a perfectly good stream over it.
      await video.play().catch(() => undefined);

      const [track] = stream.getVideoTracks();

      // Continuous autofocus, where offered. Some phones otherwise lock focus
      // at infinity and never resolve a card held close to the lens.
      const capabilities = track?.getCapabilities?.() as
        | { focusMode?: string[] }
        | undefined;
      if (capabilities?.focusMode?.includes('continuous')) {
        await track
          ?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as never] })
          .catch(() => undefined);
      }

      return stream;
    } catch (error) {
      // Release the camera before trying the next constraint set, or the
      // device stays busy and every later attempt fails too.
      stream?.getTracks().forEach((track) => track.stop());
      lastError = error;
    }
  }

  const message = (lastError as Error)?.message ?? '';
  if (/permission|denied|NotAllowed/i.test(message)) {
    throw new Error('Camera permission was refused. Allow it and try again.');
  }
  if (/NotFound|DevicesNotFound/i.test(message)) {
    throw new Error('No camera found on this device.');
  }
  throw new Error(`Could not open the camera. ${message}`.trim());
}

export async function startScanner(options: ScannerOptions): Promise<ScannerHandle> {
  const { video, onResult, onError } = options;
  const interval = options.fallbackIntervalMs ?? 150;

  const stream = await openCamera(video);
  let stopped = false;
  let frame = 0;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    for (const track of stream.getTracks()) track.stop();

    /*
     * Only detach if the element is still showing OUR stream.
     *
     * React 18 StrictMode mounts effects twice in development: start A,
     * cleanup A, start B. Both share one <video>. An unconditional
     * `video.srcObject = null` in A's cleanup runs AFTER B has attached, so it
     * rips out B's live stream and leaves a permanently black preview.
     *
     * This was a real, reproducible bug — the diagnostics showed the startup
     * lines printed twice, once per mount, with a black screen after.
     */
    if (video.srcObject === stream) {
      video.srcObject = null;
    }
  };

  const finish = (text: string) => {
    if (stopped) return;
    stop();
    onResult(text);
  };

  // Torch. Advertised through track capabilities, and genuinely useful at a
  // gate after dark — a printed card in a dim corridor is the hardest case
  // this scanner has to handle.
  const [videoTrack] = stream.getVideoTracks();
  const torchCapability = (
    videoTrack?.getCapabilities?.() as { torch?: boolean } | undefined
  )?.torch;
  const hasTorch = torchCapability === true;

  const settings = videoTrack?.getSettings?.() ?? {};
  const facing = (settings as { facingMode?: string }).facingMode ?? 'unknown';
  const label = videoTrack?.label ?? '';
  const resolution = {
    width: (settings as { width?: number }).width ?? video.videoWidth,
    height: (settings as { height?: number }).height ?? video.videoHeight,
  };

  const setTorch = async (on: boolean): Promise<boolean> => {
    if (!hasTorch || !videoTrack || stopped) return false;
    try {
      await videoTrack.applyConstraints({ advanced: [{ torch: on } as never] });
      return on;
    } catch {
      // Several devices advertise a torch and then refuse. Report the truth
      // rather than leaving the UI showing a light that is not on.
      return false;
    }
  };

  // --- native engine ---------------------------------------------------------
  if (window.BarcodeDetector) {
    let detector: BarcodeDetectorLike;
    try {
      detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      detector = new window.BarcodeDetector();
    }

    let busy = false;
    const tick = async () => {
      if (stopped) return;
      if (!busy && video.readyState >= 2) {
        busy = true;
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue;
          if (value) {
            finish(value);
            return;
          }
        } catch {
          // A single failed frame is normal — keep going.
        } finally {
          busy = false;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return {
      stop,
      engine: 'native',
      resolution,
      facing,
      label,
      hasTorch,
      setTorch,
    };
  }

  // --- JavaScript fallback ---------------------------------------------------
  let reader: { decodeFromCanvas: (canvas: HTMLCanvasElement) => { getText(): string } };
  try {
    const { BrowserQRCodeReader } = await import('@zxing/browser');
    reader = new BrowserQRCodeReader() as never;
  } catch {
    stop();
    throw new Error('No QR decoder is available in this browser.');
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  let lastRun = 0;

  const tick = (now: number) => {
    if (stopped) return;

    if (now - lastRun >= interval && video.readyState >= 2 && video.videoWidth) {
      lastRun = now;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const decoded = reader.decodeFromCanvas(canvas);
        const text = decoded?.getText();
        if (text) {
          finish(text);
          return;
        }
      } catch {
        // Nothing found in this frame. Expected, most of the time.
      }
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  if (onError && !window.BarcodeDetector) {
    // Not an error, but worth surfacing when someone reports slowness.
    onError('');
  }

  return {
    stop,
    engine: 'zxing',
    resolution,
    facing,
    label,
    hasTorch,
    setTorch,
  };
}
