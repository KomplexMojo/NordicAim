import { z } from 'zod';

import { ShotPosition, StageState, TemplateId, Warning } from './enums';
import { Id, ShotId, UtcIso } from './primitives';
import { Calibration } from './photo';

export const Shot = z
  .object({
    id: ShotId,
    xMm: z.number(),
    yMm: z.number(),
    multiplicity: z.number().int().min(1).max(20),
    positionOverrides: z.array(ShotPosition.nullable()).nullable(),
    source: z.enum(['auto', 'manual']),
    confidence: z.number().min(0).max(1).nullable(),
    cluster: z.boolean(),
    /**
     * backing-sheet.md §5.5 (REV-38): the colour path found a blob far larger than the median, so two
     * shots may share this hole. A hint only — it never changes `multiplicity`. Defaults to false so
     * shots stored before REV-38 read back unchanged.
     */
    possibleOverlap: z.boolean().default(false),
    /**
     * REV-39 (M20): the hole's overlap evidence — its area over the photo's median hole area, as
     * detection measured it (the coloured area on the colour path, backing-sheet.md §5.4; the blob
     * area on the standard path). Reconciliation reads it only when rounds are short. Absent on
     * manual shots and on shots stored before M20.
     */
    overlapRatio: z.number().nonnegative().optional(),
    /**
     * REV-39 (M20): set on an automatic shot whose extra units (`multiplicity - 1`) were inferred
     * by reconciliation as rounds through the same hole. The hole itself was detected; only the
     * extra rounds are assumed.
     */
    inferred: z.literal('double-punch').optional(),
  })
  .refine((s) => s.positionOverrides === null || s.positionOverrides.length === s.multiplicity);
export type Shot = z.infer<typeof Shot>;

/**
 * backing-sheet.md §3: how this photo's shots were found, so the owner can see why a photo was or
 * wasn't treated as backed. `backing` is `off` when the session's mode is `none` (and on an analysis
 * whose Stage A has not run yet — the spec names no separate "undecided" value; see the milestone's
 * Open questions).
 */
export const DetectionRecord = z.object({
  method: z.enum(['colour', 'standard']),
  backing: z.enum(['detected', 'not-detected', 'forced', 'off']),
  fallbackReason: z.string().max(200).nullable(),
  // REV-82: the backing colour in force when the shots were found, as `#RRGGBB` for drawing them. Absent on older analyses and
  // whenever no measured colour was in use; the shots are then drawn in the default red.
  backingColour: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
});
export type DetectionRecord = z.infer<typeof DetectionRecord>;

export const INITIAL_DETECTION: DetectionRecord = { method: 'standard', backing: 'off', fallbackReason: null };

export const PipelineState = z.object({
  stageA: StageState,
  stageB: StageState,
  error: z.string().max(200).nullable(),
  alignment: z.object({
    method: z.enum(['cv', 'overlay', 'manual', 'none']),
    confidence: z.number().min(0).max(1).nullable(),
  }),
  templateHint: z.object({ template: TemplateId, confidence: z.number().min(0).max(1) }).nullable(),
  sharpness: z.number().nullable(),
  warnings: z.array(Warning),
  // REV-38: recorded on every analysis (backing-sheet.md §3, milestone step 2a). Defaulted so
  // analyses stored before REV-38 still read back.
  detection: DetectionRecord.default(INITIAL_DETECTION),
});
export type PipelineState = z.infer<typeof PipelineState>;

// AnalysisResult (from analyzeTarget, geometry-scoring §10). The full shape is defined here as
// TypeScript types; the store schema below is intentionally permissive (it validates shape, not
// every numeric invariant) so M03's scoring engine can evolve without touching persisted-record
// validation.
export interface UnitResult {
  shotId: string;
  unitIndex: number;
  xMm: number;
  yMm: number;
  radialMm: number;
  position: 'prone' | 'standing';
  ring: number | null;
  isX: boolean | null;
  zone: 'clean' | 'hit' | 'miss' | null;
}

export interface Angular {
  moa: number;
  mrad: number;
}

export interface MpiOffset {
  xMm: number;
  yMm: number;
  xMoa: number;
  yMoa: number;
  xMrad: number;
  yMrad: number;
}

export interface GroupEllipse {
  cxMm: number;
  cyMm: number;
  rxMm: number;
  ryMm: number;
  angleDeg: number;
}

/**
 * geometry-scoring §4, §8 (REV-39): a definite score. Rounds that were declared but not found are
 * misses and score 0, so the total is the located units' total; `tally` counts located units only.
 */
export interface PrecisionScore {
  tally: number[];
  xCount: number;
  identifiedTotal: number;
  maxPossible: number;
}

/**
 * geometry-scoring §5, §8 (REV-39): `misses` counts located units outside the zone **plus** the
 * subset's `missing` rounds, each of which is a miss.
 */
export interface SightingOutcome {
  zoneDiameterMm: 45 | 115 | null;
  hits: number;
  clean: number;
  misses: number;
}

export interface SubsetResult {
  key: 'prone' | 'standing' | 'all';
  declared: number;
  identified: number;
  missing: number;
  overcount: number;
  units: UnitResult[];
  mpi: { xMm: number; yMm: number } | null;
  extremeSpreadMm: number | null;
  extremeSpreadAngular: Angular | null;
  /** Precision: mean distance of the units from the group's own centre (`mpi`). */
  meanRadiusMm: number | null;
  /** Accuracy: root-mean-square distance of the units from the bullseye (0, 0). */
  accuracyRmseMm: number | null;
  mpiOffset: MpiOffset | null;
  groupEllipse: GroupEllipse | null;
  precision: PrecisionScore | null;
  sighting: SightingOutcome | null;
  warnings: Array<'overcount'>;
}

export interface AnalysisResult {
  engineVersion: string;
  template: 'sighting' | 'precision';
  position: 'prone' | 'standing' | 'both';
  subsets: SubsetResult[];
  all: SubsetResult;
}

// Permissive: validates the record's overall shape without re-deriving every scoring invariant.
export const AnalysisResultSchema: z.ZodType<AnalysisResult> = z.object({
  engineVersion: z.string(),
  template: z.enum(['sighting', 'precision']),
  position: z.enum(['prone', 'standing', 'both']),
  subsets: z.array(z.custom<SubsetResult>()),
  all: z.custom<SubsetResult>(),
});

export const TargetAnalysis = z.object({
  schemaVersion: z.literal(1),
  photoId: Id,
  calibration: Calibration.nullable(), // WORKING image px
  shots: z.array(Shot),
  pipeline: PipelineState,
  updatedAt: UtcIso,
  computed: z.object({ engineVersion: z.string(), result: AnalysisResultSchema }).nullable(),
});
export type TargetAnalysis = z.infer<typeof TargetAnalysis>;

export function initialAnalysis(photoId: string, nowIso: string): TargetAnalysis {
  return {
    schemaVersion: 1,
    photoId,
    calibration: null,
    shots: [],
    pipeline: {
      stageA: 'pending',
      stageB: 'pending',
      error: null,
      alignment: { method: 'none', confidence: null },
      templateHint: null,
      sharpness: null,
      warnings: [],
      detection: INITIAL_DETECTION,
    },
    updatedAt: nowIso,
    computed: null,
  };
}
