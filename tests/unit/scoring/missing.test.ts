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

describe('scoring/missing buildPrecisionScore (geometry-scoring.md §8.1, REV-39)', () => {
  it('declared 10, identified rings [10,9,8,8,7] -> a definite 42 / 100: the 5 missing rounds are misses and score 0', () => {
    const units = [ring(10, true), ring(9), ring(8), ring(8), ring(7)];
    const score = buildPrecisionScore(units, 10);
    expect(score).toEqual({ tally: [0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 1], xCount: 1, identifiedTotal: 42, maxPossible: 100 });
  });

  it('identified = 0 -> total 0', () => {
    expect(buildPrecisionScore([], 10).identifiedTotal).toBe(0);
  });

  it('over-count: declared 3, identified 5 -> the identified total', () => {
    const units = [ring(10), ring(9), ring(8), ring(7), ring(6)];
    expect(buildPrecisionScore(units, 3).identifiedTotal).toBe(40);
  });

  it('tally counts units per ring, indexed 0..10', () => {
    const units = [ring(10), ring(10), ring(0), ring(5)];
    const score = buildPrecisionScore(units, 4);
    expect(score.tally).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2]);
  });

  it('has no score range any more (REV-18 superseded by REV-39)', () => {
    expect(buildPrecisionScore([ring(9)], 10)).not.toHaveProperty('range');
  });
});

describe('scoring/missing combinePrecisionScores', () => {
  it('sums tally, xCount and identifiedTotal element-wise', () => {
    const a = buildPrecisionScore([ring(10, true), ring(9)], 2);
    const b = buildPrecisionScore([ring(8)], 2);
    const combined = combinePrecisionScores(a, b, 4);
    expect(combined).toEqual({ tally: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1], xCount: 1, identifiedTotal: 27, maxPossible: 40 });
  });
});

function su(shotId: string, xMm: number, yMm: number, zone: SightingUnit['zone'], unitIndex = 0): SightingUnit {
  return { shotId, unitIndex, xMm, yMm, radialMm: Math.hypot(xMm, yMm), zone };
}

describe('scoring/missing buildSightingOutcome (geometry-scoring.md §8.2, REV-39)', () => {
  // prone, declared 5: identified (0,5) clean, (10,0) clean, (30,0) miss -> hits 2, missing 2
  const units: SightingUnit[] = [su('u1', 0, 5, 'clean'), su('u2', 10, 0, 'clean'), su('u3', 30, 0, 'miss')];

  it('a missing round is a miss: hits 2, clean 2, misses 1 located + 2 missing = 3', () => {
    expect(buildSightingOutcome(units, 5, 45)).toEqual({ zoneDiameterMm: 45, hits: 2, clean: 2, misses: 3 });
  });

  it('|U| = 0: every declared round is a miss', () => {
    expect(buildSightingOutcome([], 5, 45)).toEqual({ zoneDiameterMm: 45, hits: 0, clean: 0, misses: 5 });
  });

  it('over-count: misses are the located units outside the zone only', () => {
    const over: SightingUnit[] = [su('a', 0, 0, 'clean'), su('b', 1, 0, 'clean'), su('c', 90, 0, 'miss')];
    expect(buildSightingOutcome(over, 1, 45)).toEqual({ zoneDiameterMm: 45, hits: 2, clean: 2, misses: 1 });
  });
});

describe('scoring/missing combineSightingOutcomes', () => {
  it('sums hits, clean and misses; the combined zone is null', () => {
    const prone = buildSightingOutcome([su('p1', 0, 0, 'clean')], 2, 45);
    const standing = buildSightingOutcome([su('s1', 10, 0, 'clean')], 1, 115);
    expect(combineSightingOutcomes(prone, standing)).toEqual({ zoneDiameterMm: null, hits: 2, clean: 2, misses: 1 });
  });
});
