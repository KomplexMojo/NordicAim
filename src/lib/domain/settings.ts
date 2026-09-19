import { z } from 'zod';

import { BackingMode, BackingSheet, DEFAULT_BACKING_MODE, type ColourSignature } from './backing';

export const AppSettings = z.object({
  schemaVersion: z.literal(1),
  key: z.literal('app'),
  profileOverrides: z.object({ holeDiameterMm: z.number().positive() }),
  persistRequested: z.boolean(),
  persisted: z.boolean().nullable(),
  // REV-48 (data-model §5, backing-sheet.md §2, §3): the backing setting itself, for every session.
  // `backing.cardPhotoId` is always null — the card photo is not kept, only its measured colour.
  backingMode: BackingMode,
  backing: BackingSheet.nullable(),
});
export type AppSettings = z.infer<typeof AppSettings>;

/** data-model §5 / REV-47 Settings: the .22 LR hole size, and the range the Hole size field accepts. */
export const DEFAULT_HOLE_DIAMETER_MM = 5.6;
export const MIN_HOLE_DIAMETER_MM = 2;
export const MAX_HOLE_DIAMETER_MM = 12;

export function isValidHoleDiameterMm(mm: number): boolean {
  return Number.isFinite(mm) && mm >= MIN_HOLE_DIAMETER_MM && mm <= MAX_HOLE_DIAMETER_MM;
}

export function defaultAppSettings(): AppSettings {
  return {
    schemaVersion: 1,
    key: 'app',
    profileOverrides: { holeDiameterMm: DEFAULT_HOLE_DIAMETER_MM },
    persistRequested: false,
    persisted: null,
    backingMode: DEFAULT_BACKING_MODE,
    backing: null,
  };
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw);
}

/**
 * REV-48 migration (data-model §5, backing-sheet.md §3a step 1). A row written by REV-38 carries
 * `lastBackingMode` / `lastBacking`; they are copied to `backingMode` / `backing` and dropped. A row
 * from before REV-38 has neither and reads as `'auto'` / `null`. A current row is returned unchanged.
 */
export function upgradeSettings(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  if ('backingMode' in raw && 'backing' in raw && !('lastBackingMode' in raw) && !('lastBacking' in raw)) return raw;
  const { lastBackingMode, lastBacking, ...rest } = raw;
  return {
    ...rest,
    backingMode: 'backingMode' in raw ? raw.backingMode : (lastBackingMode ?? DEFAULT_BACKING_MODE),
    backing: 'backing' in raw ? raw.backing : (lastBacking ?? null),
  };
}

/**
 * backing-sheet.md §5 (REV-48): what A5 and Re-analyze hand the worker — the Settings mode, and the
 * card's measured colour when there is one. Read when detection runs, never copied anywhere.
 */
export function backingInputFromSettings(settings: AppSettings): { mode: BackingMode; colour: ColourSignature | null } {
  return { mode: settings.backingMode, colour: settings.backing?.colour ?? null };
}
