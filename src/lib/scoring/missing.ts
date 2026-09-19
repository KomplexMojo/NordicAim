// geometry-scoring.md §8. Missing rounds and over-count, per subset, for both templates.
//
// REV-39 (M20): the declared rounds are fact. By the time anything is scored, reconciliation
// (`reconcile.ts`) has already inferred any double punches, so a round that is still missing is a
// **miss**: it scores 0 on a precision target and counts as a miss on a sighting target. The score is
// definite — the optimistic / pessimistic / averaged range of REV-18 is gone.

import type { PrecisionScore, SightingOutcome } from '../domain/analysis';
import type { RingScore } from './precision';
import type { SightingZone } from './sighting';

export type { PrecisionScore, SightingOutcome };

export interface MissingInfo {
  identified: number;
  missing: number;
  overcount: number;
  warnings: Array<'overcount'>;
}

/** `missing = max(0, declared - identified)`, `overcount = max(0, identified - declared)`. */
export function missingInfo(identified: number, declared: number): MissingInfo {
  const missing = Math.max(0, declared - identified);
  const overcount = Math.max(0, identified - declared);
  return { identified, missing, overcount, warnings: overcount > 0 ? ['overcount'] : [] };
}

/**
 * geometry-scoring.md §4, §8.1. The tally and total of the located units; a missing round is a miss
 * and adds 0, so `identifiedTotal` is the definite total.
 */
export function buildPrecisionScore(units: RingScore[], declared: number): PrecisionScore {
  const tally = new Array<number>(11).fill(0);
  let xCount = 0;
  let identifiedTotal = 0;
  for (const u of units) {
    tally[u.ring] = (tally[u.ring] ?? 0) + 1;
    identifiedTotal += u.ring;
    if (u.isX) xCount++;
  }
  return { tally, xCount, identifiedTotal, maxPossible: declared * 10 };
}

/** Sums two subsets' precision scores element-wise (geometry-scoring.md §8.1, `all` of a `both` target). */
export function combinePrecisionScores(a: PrecisionScore, b: PrecisionScore, declaredAll: number): PrecisionScore {
  return {
    tally: a.tally.map((v, i) => v + (b.tally[i] ?? 0)),
    xCount: a.xCount + b.xCount,
    identifiedTotal: a.identifiedTotal + b.identifiedTotal,
    maxPossible: declaredAll * 10,
  };
}

export interface SightingUnit {
  shotId: string;
  unitIndex: number;
  xMm: number;
  yMm: number;
  radialMm: number;
  zone: SightingZone;
}

/**
 * geometry-scoring.md §5, §8.2. Hits and clean count the located units; `misses` is the located units
 * outside the zone plus every missing round (REV-39: a round that was not found is a miss).
 */
export function buildSightingOutcome(units: SightingUnit[], declared: number, zoneDiameterMm: 45 | 115 | null): SightingOutcome {
  const { missing } = missingInfo(units.length, declared);
  const hits = units.filter((u) => u.zone !== 'miss').length;
  const clean = units.filter((u) => u.zone === 'clean').length;
  return { zoneDiameterMm, hits, clean, misses: units.length - hits + missing };
}

/** geometry-scoring.md §8.2, `all` of a `both` target: hits, clean and misses are summed over the subsets. */
export function combineSightingOutcomes(prone: SightingOutcome, standing: SightingOutcome): SightingOutcome {
  return {
    zoneDiameterMm: null,
    hits: prone.hits + standing.hits,
    clean: prone.clean + standing.clean,
    misses: prone.misses + standing.misses,
  };
}
