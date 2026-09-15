// capture-overlay.md §2. Browser camera adapter (allowed to touch `navigator`, `document`, canvas).

export type CameraErrorCode = 'insecure_context' | 'permission_denied' | 'no_camera' | 'camera_error';

export class CameraError extends Error {
  readonly code: CameraErrorCode;
  constructor(code: CameraErrorCode, cause?: unknown) {
    super(code);
    this.name = 'CameraError';
    this.code = code;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

function errorName(err: unknown): string | null {
  if (err !== null && typeof err === 'object' && 'name' in err && typeof err.name === 'string') return err.name;
  return null;
}

/** §2 Errors: `!isSecureContext` → insecure_context; NotAllowedError → permission_denied; NotFoundError → no_camera; else camera_error. */
export function cameraErrorCode(err: unknown, secureContext: boolean): CameraErrorCode {
  if (!secureContext) return 'insecure_context';
  if (err instanceof CameraError) return err.code;
  const name = errorName(err);
  if (name === 'NotAllowedError') return 'permission_denied';
  if (name === 'NotFoundError') return 'no_camera';
  return 'camera_error';
}

export const PRIMARY_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
};

export const FALLBACK_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: 'environment' },
};

export async function startCamera(): Promise<MediaStream> {
  if (!globalThis.isSecureContext) throw new CameraError('insecure_context');
  const mediaDevices = globalThis.navigator?.mediaDevices;
  if (!mediaDevices?.getUserMedia) throw new CameraError('camera_error');
  try {
    try {
      return await mediaDevices.getUserMedia(PRIMARY_CONSTRAINTS);
    } catch (err) {
      if (errorName(err) !== 'OverconstrainedError') throw err;
      return await mediaDevices.getUserMedia(FALLBACK_CONSTRAINTS);
    }
  } catch (err) {
    throw new CameraError(cameraErrorCode(err, true), err);
  }
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/** Canvas at videoWidth × videoHeight → drawImage → toBlob('image/jpeg', 0.92); a null blob throws. No ImageCapture (iOS). */
export async function grabFrame(video: HTMLVideoElement): Promise<{ blob: Blob; widthPx: number; heightPx: number }> {
  const widthPx = video.videoWidth;
  const heightPx = video.videoHeight;
  if (widthPx === 0 || heightPx === 0) throw new Error('Video has no frame yet');
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(video, 0, 0, widthPx, heightPx);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (blob === null) throw new Error('canvas.toBlob returned null');
  return { blob, widthPx, heightPx };
}

/**
 * `CaptureInfo.trackSettings` = primitive values of `track.getSettings()`. Non-finite numbers are dropped because the
 * stored schema (`z.number()`) rejects NaN/Infinity.
 */
export function primitiveTrackSettings(settings: object | null | undefined): Record<string, string | number | boolean> | null {
  if (settings == null) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'string' || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

export function streamTrackSettings(stream: MediaStream | null): Record<string, string | number | boolean> | null {
  const track = stream?.getVideoTracks()[0];
  if (!track || typeof track.getSettings !== 'function') return null;
  return primitiveTrackSettings(track.getSettings());
}
