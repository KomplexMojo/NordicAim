// capture-overlay.md §1.2: template and position remembered per session in localStorage `asa.capture.<sessionId>`.

import { z } from 'zod';

import { Position, TemplateId } from '@/lib/domain/enums';

export const DEFAULT_OUTER_DIAMETER_FRACTION = 0.85;
export const MIN_OUTER_DIAMETER_FRACTION = 0.5;
export const MAX_OUTER_DIAMETER_FRACTION = 0.95;

export interface CapturePrefs {
  template: TemplateId | null;
  position: Position | null;
  outerDiameterFraction: number;
}

const StoredPrefs = z.object({
  template: TemplateId.nullable().catch(null),
  position: Position.nullable().catch(null),
  outerDiameterFraction: z
    .number()
    .min(MIN_OUTER_DIAMETER_FRACTION)
    .max(MAX_OUTER_DIAMETER_FRACTION)
    .catch(DEFAULT_OUTER_DIAMETER_FRACTION),
});

type PrefsStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function capturePrefsKey(sessionId: string): string {
  return `asa.capture.${sessionId}`;
}

export function defaultCapturePrefs(): CapturePrefs {
  return { template: null, position: null, outerDiameterFraction: DEFAULT_OUTER_DIAMETER_FRACTION };
}

export function parseCapturePrefs(raw: string | null): CapturePrefs {
  if (raw === null) return defaultCapturePrefs();
  try {
    const parsed = StoredPrefs.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : defaultCapturePrefs();
  } catch {
    return defaultCapturePrefs();
  }
}

function defaultStorage(): PrefsStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadCapturePrefs(sessionId: string, storage: PrefsStorage | null = defaultStorage()): CapturePrefs {
  try {
    return parseCapturePrefs(storage?.getItem(capturePrefsKey(sessionId)) ?? null);
  } catch {
    return defaultCapturePrefs();
  }
}

export function saveCapturePrefs(
  sessionId: string,
  prefs: CapturePrefs,
  storage: PrefsStorage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(capturePrefsKey(sessionId), JSON.stringify(prefs));
  } catch {
    // Private mode / quota: remembering the picks is a convenience only.
  }
}
