// geometry-scoring.md §8. Missing-round and over-count handling, per subset, for both templates.

import { mpi } from './groups';
import type { Point } from './groups';
import type { PrecisionScore, SightingModeOutcome, SightingOutcome } from '../domain/analysis';
import type { RingScore } from './precision';
import type { SightingZone } from './sighting';

export type { PrecisionScore, SightingModeOutcome, SightingOutcome };

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
 * geometry-scoring.md §8.1. If `overcount > 0`, all three modes equal the identified-only total. If
 * `identified = 0`, all three are 0 (identifiedTotal is 0 in that case too).
 */
export function buildPrecisionScore(units: RingScore[], declared: number): PrecisionScore {
  const { identified, missing, overcount } = missingInfo(units.length, declared);

  const tally = new Array<number>(11).fill(0);
  let xCount = 0;
  let identifiedTotal = 0;
  for (const u of units) {
    tally[u.ring] = (tally[u.ring] ?? 0) + 1;
    identifiedTotal += u.ring;
    if (u.isX) xCount++;
  }
  const maxPossible = declared * 10;

  let range: { optimistic: number; pessimistic: number; averaged: number };
  if (overcount > 0 || identified === 0) {
    range = { optimistic: identifiedTotal, pessimistic: identifiedTotal, averaged: identifiedTotal };
  } else {
    const rings = units.map((u) => u.ring);
    const max = Math.max(...rings);
    const min = Math.min(...rings);
    const mean = rings.reduce((sum, r) => sum + r, 0) / rings.length;
    range = {
      optimistic: identifiedTotal + missing * max,
      pessimistic: identifiedTotal + missing * min,
      averaged: identifiedTotal + missing * mean,
    };
  }

  return { tally, xCount, identifiedTotal, maxPossible, range };
}

/** Sums two subsets' precision scores element-wise (geometry-scoring.md §8.1, `all` of a `both` target). */
export function combinePrecisionScores(a: PrecisionScore, b: PrecisionScore, declaredAll: number): PrecisionScore {
  const tally = a.tally.map((v, i) => v + (b.tally[i] ?? 0));
  return {
    tally,
    xCount: a.xCount + b.xCount,
    identifiedTotal: a.identifiedTotal + b.identifiedTotal,
    maxPossible: declaredAll * 10,
    range: {
      optimistic: a.range.optimistic + b.range.optimistic,
      pessimistic: a.range.pessimistic + b.range.pessimistic,
      averaged: a.range.averaged + b.range.averaged,
    },
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

type SightingMode = 'optimistic' | 'pessimistic' | 'averaged';

/** Tie-break for equal radialMm, matching geometry-scoring.md §7: shotId ascending, then unitIndex ascending. */
function compareTieBreak(a: SightingUnit, b: SightingUnit): number {
  if (a.shotId !== b.shotId) return a.shotId < b.shotId ? -1 : 1;
  return a.unitIndex - b.unitIndex;
}

/**
 * The identified units' coordinates, plus `missing` synthetic points per the mode's placement rule
 * (geometry-scoring.md §8.2). Empty when there are no identified units.
 *
 * §8.2 states the tie-break only for `optimistic` ("smallest radialMm... ties: first by sort order of
 * §7"). For `pessimistic` ("largest radialMm") we apply the same §7 tie-break convention — shotId
 * ascending, then unitIndex ascending — among the units tied for the largest radialMm, taking the
 * first such unit. This is the natural symmetric reading, not stated explicitly by the spec; see the
 * milestone's Open questions.
 */
export function pointsForMode(units: SightingUnit[], missing: number, mode: SightingMode): Point[] {
  const base: Point[] = units.map((u) => ({ xMm: u.xMm, yMm: u.yMm }));
  if (units.length === 0 || missing <= 0) return base;

  if (mode === 'averaged') {
    const center = mpi(units)!;
    return [...base, ...Array<Point>(missing).fill(center)];
  }

  const picked =
    mode === 'optimistic'
      ? [...units].sort((a, b) => a.radialMm - b.radialMm || compareTieBreak(a, b))[0]!
      : [...units].sort((a, b) => b.radialMm - a.radialMm || compareTieBreak(a, b))[0]!;
  const point: Point = { xMm: picked.xMm, yMm: picked.yMm };
  return [...base, ...Array<Point>(missing).fill(point)];
}

function modeOutcome(units: SightingUnit[], missing: number, declared: number, mode: SightingMode): SightingModeOutcome {
  const hitsId = units.filter((u) => u.zone !== 'miss').length;

  let hits: number;
  if (units.length === 0) {
    hits = 0;
  } else if (mode === 'pessimistic') {
    // placed units are always counted as misses
    hits = hitsId;
  } else if (mode === 'optimistic') {
    const sorted = [...units].sort((a, b) => a.radialMm - b.radialMm || compareTieBreak(a, b));
    const best = sorted[0]!;
    hits = hitsId + missing * (best.zone !== 'miss' ? 1 : 0);
  } else {
    hits = hitsId + missing * (hitsId / units.length);
  }

  const points = pointsForMode(units, missing, mode);
  return { hits, misses: declared - hits, mpi: points.length === 0 ? null : mpi(points) };
}

/**
 * geometry-scoring.md §8.2. If `overcount > 0`, all three modes equal the identified-only outcome.
 * If there are no identified units, every mode has `hits: 0, mpi: null`.
 */
export function buildSightingOutcome(units: SightingUnit[], declared: number, zoneDiameterMm: 45 | 115 | null): SightingOutcome {
  const { missing, overcount } = missingInfo(units.length, declared);

  const hits = units.filter((u) => u.zone !== 'miss').length;
  const clean = units.filter((u) => u.zone === 'clean').length;
  const misses = units.length - hits;

  const buildMode = (mode: SightingMode): SightingModeOutcome => {
    if (overcount > 0) {
      return { hits, misses: declared - hits, mpi: mpi(units) };
    }
    return modeOutcome(units, missing, declared, mode);
  };

  return {
    zoneDiameterMm,
    hits,
    clean,
    misses,
    range: { optimistic: buildMode('optimistic'), pessimistic: buildMode('pessimistic'), averaged: buildMode('averaged') },
  };
}

/**
 * geometry-scoring.md §8.2, `all` of a `both` target: hits/misses are summed per mode; mpi is the
 * mean over the union of each subset's identified-plus-placed points for that mode.
 */
export function combineSightingOutcomes(
  prone: { units: SightingUnit[]; missing: number; sighting: SightingOutcome },
  standing: { units: SightingUnit[]; missing: number; sighting: SightingOutcome },
  declaredAll: number,
): SightingOutcome {
  const combineMode = (mode: SightingMode): SightingModeOutcome => {
    const hits = prone.sighting.range[mode].hits + standing.sighting.range[mode].hits;
    const points = [...pointsForMode(prone.units, prone.missing, mode), ...pointsForMode(standing.units, standing.missing, mode)];
    return { hits, misses: declaredAll - hits, mpi: points.length === 0 ? null : mpi(points) };
  };

  return {
    zoneDiameterMm: null,
    hits: prone.sighting.hits + standing.sighting.hits,
    clean: prone.sighting.clean + standing.sighting.clean,
    misses: prone.sighting.misses + standing.sighting.misses,
    range: { optimistic: combineMode('optimistic'), pessimistic: combineMode('pessimistic'), averaged: combineMode('averaged') },
  };
}
