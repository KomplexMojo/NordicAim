import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import { IncompleteCategorizationError, emptyCategorization } from '@/lib/domain/categorization';
import type { Shot } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { ENGINE_VERSION, analyzeTarget } from '@/lib/scoring/analyze';

function readFixture(name: string): { template: 'sighting' | 'precision'; categorization: Categorization; shots: Shot[] } {
  const path = fileURLToPath(new URL(`../../../fixtures/reference/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function shot(overrides: Partial<Shot>): Shot {
  return {
    id: 's',
    xMm: 0,
    yMm: 0,
    multiplicity: 1,
    positionOverrides: null,
    source: 'manual',
    confidence: null,
    cluster: false,
    possibleOverlap: false,
    ...overrides,
  };
}

describe('scoring/analyze analyzeTarget: golden parity (geometry-scoring.md §9)', () => {
  it('§9.1 precision fixture', () => {
    const fixture = readFixture('sample-shots-precision.json');
    const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots: fixture.shots });

    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.position).toBe('prone');
    const subset = result.all;
    expect(subset.precision!.tally).toEqual([0, 0, 0, 0, 0, 1, 3, 2, 2, 1, 1]);
    expect(subset.precision!.identifiedTotal).toBe(72);
    expect(subset.precision!.maxPossible).toBe(100);
    expect(subset.precision!.xCount).toBe(1);
    expect(subset.identified).toBe(10);
    expect(subset.missing).toBe(0);
    expect(subset.precision!.range).toEqual({ optimistic: 72, pessimistic: 72, averaged: 72 });
    expect(subset.extremeSpreadMm).toBeCloseTo(41.881, 3);
    expect(subset.extremeSpreadAngular!.moa).toBeCloseTo(2.8795, 3);
    expect(subset.extremeSpreadAngular!.mrad).toBeCloseTo(0.8376, 3);
    // geometry-scoring.md §9.1 states mpi (-14.49, -18.55) (±1e-6); fixtures/reference/sample-shots-precision.json
    // tolerances.mpi is 1e-6. toBeCloseTo(x, 6) checks |actual - expected| < 5e-7, tighter than the stated ±1e-6.
    expect(subset.mpi!.xMm).toBeCloseTo(-14.49, 6);
    expect(subset.mpi!.yMm).toBeCloseTo(-18.55, 6);
  });

  it('§9.2 sighting fixture, categorized prone', () => {
    const fixture = readFixture('sample-shots-sighting.json');
    const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots: fixture.shots });

    const subset = result.all;
    expect(subset.sighting!.hits).toBe(9);
    expect(subset.sighting!.misses).toBe(1);
    expect(subset.sighting!.clean).toBe(9);
    expect(subset.identified).toBe(10);
    expect(subset.missing).toBe(0);
    expect(subset.extremeSpreadMm).toBeCloseTo(27.681, 3);
    expect(subset.extremeSpreadAngular!.moa).toBeCloseTo(1.9032, 3);
    expect(subset.extremeSpreadAngular!.mrad).toBeCloseTo(0.5536, 3);
    expect(subset.mpi!.xMm).toBeCloseTo(9.7, 6);
    expect(subset.mpi!.yMm).toBeCloseTo(3.85, 6);
    expect(subset.meanRadiusMm).toBeCloseTo(8.624, 3);
  });

  it('§9.2 sighting fixture, re-categorized standing -> hits 10, misses 0', () => {
    const fixture = readFixture('sample-shots-sighting.json');
    const categorization: Categorization = { template: 'sighting', position: 'standing', roundsProne: null, roundsStanding: 10 };
    const result = analyzeTarget({ template: fixture.template, categorization, shots: fixture.shots });

    expect(result.all.sighting!.hits).toBe(10);
    expect(result.all.sighting!.misses).toBe(0);
  });
});

describe('scoring/analyze analyzeTarget: contract', () => {
  it('throws IncompleteCategorizationError when categorization is incomplete', () => {
    expect(() => analyzeTarget({ template: 'precision', categorization: emptyCategorization(), shots: [] })).toThrow(
      IncompleteCategorizationError,
    );
  });

  it('defaults to BIATHLON_50M when no profile is given', () => {
    const categorization: Categorization = { template: 'precision', position: 'prone', roundsProne: 1, roundsStanding: null };
    const result = analyzeTarget({ template: 'precision', categorization, shots: [shot({ id: 'a', xMm: 0, yMm: 0 })] });
    expect(result.all.extremeSpreadAngular).toBeNull(); // single unit -> ES null -> angular null
    expect(result.all.precision!.tally[10]).toBe(1);
  });

  it('a custom profile changes the hole diameter and distance used for scoring', () => {
    const categorization: Categorization = { template: 'precision', position: 'prone', roundsProne: 1, roundsStanding: null };
    const bigHole = { ...BIATHLON_50M, holeDiameterMm: 20, distanceM: 100 } as unknown as typeof BIATHLON_50M;
    const result = analyzeTarget({ template: 'precision', categorization, shots: [shot({ id: 'a', xMm: 79, yMm: 0 })], profile: bigHole });
    // radialMm 79, h=10 -> netRadius 69, which fits ring 2's radius (69.2) but not ring 3's (61.2)
    expect(result.all.precision!.tally[2]).toBe(1);
  });

  it('all subset equals the single subset (re-keyed) for a single-position target', () => {
    const categorization: Categorization = { template: 'precision', position: 'prone', roundsProne: 1, roundsStanding: null };
    const result = analyzeTarget({ template: 'precision', categorization, shots: [shot({ id: 'a', xMm: 0, yMm: 0 })] });
    expect(result.subsets).toHaveLength(1);
    expect(result.all).toEqual({ ...result.subsets[0], key: 'all' });
  });
});

describe('scoring/analyze analyzeTarget: both position (precision)', () => {
  const categorization: Categorization = { template: 'precision', position: 'both', roundsProne: 1, roundsStanding: 1 };

  it('splits units between subsets and reports two subsets plus a combined all', () => {
    const shots = [shot({ id: 'a', xMm: 1, yMm: 0 }), shot({ id: 'b', xMm: 50, yMm: 0 })];
    const result = analyzeTarget({ template: 'precision', categorization, shots });

    expect(result.subsets).toHaveLength(2);
    const standing = result.subsets.find((s) => s.key === 'standing')!;
    const prone = result.subsets.find((s) => s.key === 'prone')!;
    expect(standing.units.map((u) => u.shotId)).toEqual(['b']);
    expect(prone.units.map((u) => u.shotId)).toEqual(['a']);

    expect(result.all.identified).toBe(2);
    expect(result.all.declared).toBe(2);
    expect(result.all.precision!.identifiedTotal).toBe(prone.precision!.identifiedTotal + standing.precision!.identifiedTotal);
    expect(result.all.precision!.range.optimistic).toBe(prone.precision!.range.optimistic + standing.precision!.range.optimistic);
    expect(result.all.units).toHaveLength(2);
  });

  it('missing rounds in one sub-position are reflected in that subset and in all', () => {
    const shots = [shot({ id: 'a', xMm: 1, yMm: 0 })]; // only 1 unit, both roundsProne/roundsStanding = 1 -> standing gets it
    const result = analyzeTarget({ template: 'precision', categorization, shots });
    const standing = result.subsets.find((s) => s.key === 'standing')!;
    const prone = result.subsets.find((s) => s.key === 'prone')!;
    expect(standing.identified).toBe(1);
    expect(standing.missing).toBe(0);
    expect(prone.identified).toBe(0);
    expect(prone.missing).toBe(1);
    expect(result.all.missing).toBe(1);
  });
});

describe('scoring/analyze analyzeTarget: both position (sighting)', () => {
  const categorization: Categorization = { template: 'sighting', position: 'both', roundsProne: 1, roundsStanding: 1 };

  it('combines hits/misses and unions mpi placement across prone and standing', () => {
    const shots = [shot({ id: 'a', xMm: 1, yMm: 0 }), shot({ id: 'b', xMm: 60, yMm: 0 })];
    const result = analyzeTarget({ template: 'sighting', categorization, shots });

    expect(result.all.sighting!.zoneDiameterMm).toBeNull();
    expect(result.all.sighting!.hits).toBe(
      result.subsets.reduce((sum, s) => sum + s.sighting!.hits, 0),
    );
    expect(result.all.sighting!.range.optimistic.hits).toBe(
      result.subsets.reduce((sum, s) => sum + s.sighting!.range.optimistic.hits, 0),
    );
  });
});
