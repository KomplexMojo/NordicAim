// patterns.md §4: the numbers beside the Patterns drawing.

import { angular, extremeSpread, groupEllipse, mpi, mpiOffset } from '../scoring/groups';
import type { GroupEllipse, MpiOffset } from '../domain/analysis';

import type { PatternPoint } from './collect';

export const THIN_SHOT_COUNT = 10;
const DISTANCE_MM = 50_000;

export interface PatternSummary {
  shots: number;
  targets: number;
  sessions: number;
  thin: boolean;
  mpi: { xMm: number; yMm: number } | null;
  mpiOffset: MpiOffset | null;
  extremeSpreadMm: number | null;
  extremeSpreadMoa: number | null;
  /** Null while the sample is thin (patterns.md §4). */
  ellipse: GroupEllipse | null;
  /** Precision: shots per ring, index = ring 0..10, and the average ring. */
  ringCounts: number[] | null;
  averageRing: number | null;
  /** Sighting: the share (0..1) in the hit zone. */
  zoneHitShare: number | null;
}

export function summarizePatterns(points: PatternPoint[], kind: 'precision' | 'sighting'): PatternSummary {
  const center = mpi(points);
  const es = extremeSpread(points);
  const thin = points.length < THIN_SHOT_COUNT;

  let ringCounts: number[] | null = null;
  let averageRing: number | null = null;
  let zoneHitShare: number | null = null;
  if (kind === 'precision') {
    ringCounts = Array.from({ length: 11 }, () => 0);
    let total = 0;
    for (const p of points) {
      const ring = p.ring ?? 0;
      ringCounts[ring] = (ringCounts[ring] ?? 0) + 1;
      total += ring;
    }
    averageRing = points.length === 0 ? null : total / points.length;
  } else if (points.length > 0) {
    zoneHitShare = points.filter((p) => p.zone === 'hit' || p.zone === 'clean').length / points.length;
  }

  return {
    shots: points.length,
    targets: new Set(points.map((p) => p.photoId)).size,
    sessions: new Set(points.map((p) => p.sessionId)).size,
    thin,
    mpi: center,
    mpiOffset: mpiOffset(center, DISTANCE_MM),
    extremeSpreadMm: es,
    extremeSpreadMoa: angular(es, DISTANCE_MM)?.moa ?? null,
    ellipse: thin ? null : groupEllipse(points),
    ringCounts,
    averageRing,
    zoneHitShare,
  };
}
