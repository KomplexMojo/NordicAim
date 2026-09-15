import { describe, expect, it } from 'vitest';

import {
  buildPrecisionScore,
  buildSightingOutcome,
  combinePrecisionScores,
  combineSightingOutcomes,
  missingInfo,
} from '@/lib/scoring/missing';
import type { SightingUnit } from '@/lib/scoring/missing';
import type { RingScore } from '@/lib/scoring/precision';

function ring(n: number, isX = false): RingScore {
  return { ring: n, isX };
}

describe('scoring/missing missingInfo', () => {
  it('missing = max(0, declared - identified), overcount = max(0, identified - declared)', () => {
    expect(missingInfo(7, 10)).toEqual({ identified: 7, missing: 3, overcount: 0, warnings: [] });
    expect(missingInfo(5, 5)).toEqual({ identified: 5, missing: 0, overcount: 0, warnings: [] });
  });

  it('over-count: declared 3, identified 5 -> warnings: [overcount]', () => {
    expect(missingInfo(5, 3)).toEqual({ identified: 5, missing: 0, overcount: 2, warnings: ['overcount'] });
  });
});

describe('scoring/missing buildPrecisionScore (geometry-scoring.md §8.1)', () => {
  it('declared 10, identified rings [10,9,8,8,7] -> optimistic 92, pessimistic 77, averaged 84.0', () => {
    const units = [ring(10, true), ring(9), ring(8), ring(8), ring(7)];
    const score = buildPrecisionScore(units, 10);
    expect(score.identifiedTotal).toBe(42);
    expect(score.xCount).toBe(1);
    expect(score.maxPossible).toBe(100);
    expect(score.range).toEqual({ optimistic: 92, pessimistic: 77, averaged: 84.0 });
  });

  it('identified = 0 -> all three modes are 0', () => {
    const score = buildPrecisionScore([], 10);
    expect(score.identifiedTotal).toBe(0);
    expect(score.range).toEqual({ optimistic: 0, pessimistic: 0, averaged: 0 });
  });

  it('over-count: declared 3, identified 5 -> warnings [overcount], all three modes = identifiedTotal', () => {
    const units = [ring(10), ring(9), ring(8), ring(7), ring(6)];
    const score = buildPrecisionScore(units, 3);
    const identifiedTotal = 10 + 9 + 8 + 7 + 6;
    expect(score.identifiedTotal).toBe(identifiedTotal);
    expect(score.range).toEqual({ optimistic: identifiedTotal, pessimistic: identifiedTotal, averaged: identifiedTotal });
  });

  it('tally counts units per ring, indexed 0..10', () => {
    const units = [ring(10), ring(10), ring(0), ring(5)];
    const score = buildPrecisionScore(units, 4);
    expect(score.tally).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2]);
  });
});

describe('scoring/missing combinePrecisionScores', () => {
  it('sums tally, xCount, identifiedTotal, and each range mode element-wise', () => {
    const a = buildPrecisionScore([ring(10, true), ring(9)], 2);
    const b = buildPrecisionScore([ring(8)], 2);
    const combined = combinePrecisionScores(a, b, 4);
    expect(combined.tally).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1]);
    expect(combined.xCount).toBe(1);
    expect(combined.identifiedTotal).toBe(27);
    expect(combined.maxPossible).toBe(40);
    expect(combined.range).toEqual({
      optimistic: a.range.optimistic + b.range.optimistic,
      pessimistic: a.range.pessimistic + b.range.pessimistic,
      averaged: a.range.averaged + b.range.averaged,
    });
  });
});

function su(shotId: string, xMm: number, yMm: number, zone: SightingUnit['zone'], unitIndex = 0): SightingUnit {
  return { shotId, unitIndex, xMm, yMm, radialMm: Math.hypot(xMm, yMm), zone };
}

describe('scoring/missing buildSightingOutcome (geometry-scoring.md §8.2)', () => {
  // prone, declared 5: identified (0,5) clean, (10,0) clean, (30,0) miss -> hitsId 2, missing 2
  const units: SightingUnit[] = [su('u1', 0, 5, 'clean'), su('u2', 10, 0, 'clean'), su('u3', 30, 0, 'miss')];

  it('optimistic: places missing at the smallest-radialMm unit outcome', () => {
    const outcome = buildSightingOutcome(units, 5, 45);
    expect(outcome.range.optimistic.hits).toBe(4);
    expect(outcome.range.optimistic.mpi!.xMm).toBeCloseTo(8, 9);
    expect(outcome.range.optimistic.mpi!.yMm).toBeCloseTo(3, 9);
    expect(outcome.range.optimistic.misses).toBe(1);
  });

  it('pessimistic: places missing at the largest-radialMm unit, always counted as misses', () => {
    const outcome = buildSightingOutcome(units, 5, 45);
    expect(outcome.range.pessimistic.hits).toBe(2);
    expect(outcome.range.pessimistic.mpi!.xMm).toBeCloseTo(20, 9);
    expect(outcome.range.pessimistic.mpi!.yMm).toBeCloseTo(1, 9);
    expect(outcome.range.pessimistic.misses).toBe(3);
  });

  it('pessimistic tie-break: among units tied for largest radialMm, places missing at the smallest shotId (geometry-scoring.md §7 order applied symmetrically; see Open questions)', () => {
    // u2 and u3 are both at radialMm 30 (tied); shotId 'u2' < 'u3' ascending, so u2 wins the tie.
    const tied: SightingUnit[] = [su('u1', 0, 5, 'clean'), su('u2', 30, 0, 'miss'), su('u3', 0, -30, 'miss')];
    const outcome = buildSightingOutcome(tied, 4, 45);
    // hitsId = 1 (u1); missing = 1; pessimistic placement duplicates u2's coordinates (30, 0), not u3's (0, -30).
    expect(outcome.range.pessimistic.mpi!.xMm).toBeCloseTo((0 + 30 + 0 + 30) / 4, 9);
    expect(outcome.range.pessimistic.mpi!.yMm).toBeCloseTo((5 + 0 - 30 + 0) / 4, 9);
  });

  it('averaged: places missing at the identified mpi; fractional hits', () => {
    const outcome = buildSightingOutcome(units, 5, 45);
    expect(outcome.range.averaged.mpi!.xMm).toBeCloseTo(40 / 3, 6);
    expect(outcome.range.averaged.mpi!.yMm).toBeCloseTo(5 / 3, 6);
    expect(outcome.range.averaged.hits).toBeCloseTo(10 / 3, 6);
    expect(outcome.range.averaged.misses).toBeCloseTo(5 - 10 / 3, 6);
  });

  it('actual (non-range) hits/clean/misses are identified-only counts', () => {
    const outcome = buildSightingOutcome(units, 5, 45);
    expect(outcome.hits).toBe(2);
    expect(outcome.clean).toBe(2);
    expect(outcome.misses).toBe(1);
  });

  it('|U| = 0: every mode has hits 0 and mpi null', () => {
    const outcome = buildSightingOutcome([], 5, 45);
    for (const mode of ['optimistic', 'pessimistic', 'averaged'] as const) {
      expect(outcome.range[mode]).toEqual({ hits: 0, misses: 5, mpi: null });
    }
  });

  it('over-count: all three modes equal the identified-only outcome', () => {
    const over: SightingUnit[] = [su('a', 0, 0, 'clean'), su('b', 1, 0, 'clean'), su('c', 2, 0, 'clean')];
    const outcome = buildSightingOutcome(over, 1, 45);
    for (const mode of ['optimistic', 'pessimistic', 'averaged'] as const) {
      expect(outcome.range[mode].hits).toBe(3);
      expect(outcome.range[mode].mpi).toEqual({ xMm: 1, yMm: 0 });
    }
  });
});

describe('scoring/missing combineSightingOutcomes', () => {
  it('sums hits/misses per mode and unions each subset placed-point set for mpi', () => {
    const proneUnits: SightingUnit[] = [su('p1', 0, 0, 'clean')];
    const standingUnits: SightingUnit[] = [su('s1', 10, 0, 'clean')];
    const prone = buildSightingOutcome(proneUnits, 1, 45);
    const standing = buildSightingOutcome(standingUnits, 1, 115);
    const combined = combineSightingOutcomes(
      { units: proneUnits, missing: 0, sighting: prone },
      { units: standingUnits, missing: 0, sighting: standing },
      2,
    );
    expect(combined.zoneDiameterMm).toBeNull();
    expect(combined.hits).toBe(2);
    expect(combined.range.optimistic).toEqual({ hits: 2, misses: 0, mpi: { xMm: 5, yMm: 0 } });
  });
});
