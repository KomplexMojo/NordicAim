import { z } from 'zod';

import { BackingMode, BackingSheet, DEFAULT_BACKING_MODE, type ColourSignature } from './backing';

/**
 * REV-56: `gauge` = official gauge touch (the full hole), `centre` = centre in ring, `visible` = visible hole
 * touch (a smaller, adjustable hole). One formula, a different effective hole radius (`scoring/rule.ts`).
 */
export const ScoringRule = z.enum(['gauge', 'centre', 'visible']);
export type ScoringRule = z.infer<typeof ScoringRule>;
export const DEFAULT_SCORING_RULE: ScoringRule = 'gauge';

/** Provisional: the lowest edge measured on the owner's holes (p10 4.5 mm of compact single holes). */
export const DEFAULT_VISIBLE_HOLE_DIAMETER_MM = 4.5;
export const MIN_VISIBLE_HOLE_DIAMETER_MM = 2;
export const MAX_VISIBLE_HOLE_DIAMETER_MM = 5.6;

export function isValidVisibleHoleDiameterMm(mm: number): boolean {
  return Number.isFinite(mm) && mm >= MIN_VISIBLE_HOLE_DIAMETER_MM && mm <= MAX_VISIBLE_HOLE_DIAMETER_MM;
}

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
  // REV-56 (geometry-scoring.md §3): how a hole is scored. Both default when absent so older rows read back.
  scoringRule: ScoringRule.default(DEFAULT_SCORING_RULE),
  visibleHoleDiameterMm: z
    .number()
    .min(MIN_VISIBLE_HOLE_DIAMETER_MM)
    .max(MAX_VISIBLE_HOLE_DIAMETER_MM)
    .default(DEFAULT_VISIBLE_HOLE_DIAMETER_MM),
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
    scoringRule: DEFAULT_SCORING_RULE,
    visibleHoleDiameterMm: DEFAULT_VISIBLE_HOLE_DIAMETER_MM,
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
