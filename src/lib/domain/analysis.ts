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
  })
  .refine((s) => s.positionOverrides === null || s.positionOverrides.length === s.multiplicity);
export type Shot = z.infer<typeof Shot>;

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

export interface PrecisionScore {
  tally: number[];
  xCount: number;
  identifiedTotal: number;
  maxPossible: number;
  range: { optimistic: number; pessimistic: number; averaged: number };
}

export interface SightingModeOutcome {
  hits: number;
  misses: number;
  mpi: { xMm: number; yMm: number } | null;
}

export interface SightingOutcome {
  zoneDiameterMm: 45 | 115 | null;
  hits: number;
  clean: number;
  misses: number;
  range: { optimistic: SightingModeOutcome; pessimistic: SightingModeOutcome; averaged: SightingModeOutcome };
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
  meanRadiusMm: number | null;
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
    },
    updatedAt: nowIso,
    computed: null,
  };
}
