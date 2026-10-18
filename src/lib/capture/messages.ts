// User-facing strings for the capture screen (capture-overlay.md §1, §2). Pure.

import type { TemplateId } from '@/lib/domain/enums';

import type { CameraErrorCode } from './camera';

/** capture-overlay.md §1.3 label chip. */
export const OVERLAY_LABELS: Record<TemplateId, string> = {
  sighting: 'Align the dark disc with the thick circle',
  // REV-162: live precision chrome shows only the outer print ring.
  precision: "Line the paper's outer ring up with this circle.",
};

export function cameraErrorMessage(code: CameraErrorCode): string {
  switch (code) {
    case 'insecure_context':
      return 'The camera needs a secure (HTTPS) connection. Open the site over HTTPS, or use Import on Home.';
    case 'permission_denied':
      return 'Camera access was denied. Allow camera access for this site in Settings, or use Import on Home.';
    case 'no_camera':
      return 'No camera was found. Use Import on Home to add photos from your library.';
    case 'camera_error':
      return 'The camera could not start. Use Import on Home to add photos from your library.';
  }
}

/** Ingest errors carry user-readable messages (e.g. the HEIC-on-non-Safari message from image-browser.ts). */
export function ingestErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `Could not save photo: ${message}`;
}
