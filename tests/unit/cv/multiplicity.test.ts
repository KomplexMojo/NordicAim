// M21 Tests: `suggestedMultiplicity` (REV-41) and the prompt rule around it.

import { describe, expect, it } from 'vitest';

import {
  doublePunchProposal,
  equivalentDiameterMm,
  HOLE_DIAMETER_TOLERANCE,
  MAX_SUGGESTED_MULTIPLICITY,
  measuredWidthMm,
  suggestedMultiplicity,
} from '@/lib/cv/multiplicity';

const HOLE_MM = 5.6;

describe('suggestedMultiplicity (M21 step 3, REV-41)', () => {
  it('is 5.6 mm ± 5% and capped at the Inspector 20', () => {
    expect(HOLE_DIAMETER_TOLERANCE).toBe(0.05);
    expect(MAX_SUGGESTED_MULTIPLICITY).toBe(20);
  });

  it('5.6 mm -> 1', () => {
    expect(suggestedMultiplicity(5.6, HOLE_MM)).toBe(1);
  });

  it('5.8 mm (inside ±5%) -> 1', () => {
    expect(suggestedMultiplicity(5.8, HOLE_MM)).toBe(1);
  });

  it('exactly at the tolerance -> 1; just past it -> 2', () => {
    expect(suggestedMultiplicity(HOLE_MM * 1.05, HOLE_MM)).toBe(1);
    expect(suggestedMultiplicity(HOLE_MM * 1.05 + 0.01, HOLE_MM)).toBe(2);
  });

  it('11 mm -> 2', () => {
    expect(suggestedMultiplicity(11, HOLE_MM)).toBe(2);
  });

  it('60 mm -> 11 by the stated rule, not the milestone vector 20 (M21 Open questions)', () => {
    // "the whole number of hole widths that fit": ceil(60 / 5.6) = 11. The milestone's vector says 20.
    expect(suggestedMultiplicity(60, HOLE_MM)).toBe(11);
  });

  it('is capped at 20', () => {
    expect(suggestedMultiplicity(20 * HOLE_MM + 1, HOLE_MM)).toBe(20);
    expect(suggestedMultiplicity(500, HOLE_MM)).toBe(20);
  });

  it('is 1 for a meaningless width', () => {
    expect(suggestedMultiplicity(Number.NaN, HOLE_MM)).toBe(1);
    expect(suggestedMultiplicity(11, 0)).toBe(1);
  });
});

describe('equivalentDiameterMm', () => {
  it('is the diameter of the disc with that area', () => {
    expect(equivalentDiameterMm(Math.PI * 2.8 * 2.8)).toBeCloseTo(5.6, 12);
    expect(equivalentDiameterMm(0)).toBe(0);
  });
});

describe('measuredWidthMm', () => {
  const holes = [
    { xMm: 0, yMm: 0, widthMm: 6 },
    { xMm: 3, yMm: 0, widthMm: 11 },
  ];
  it('takes the nearest measured hole within the distance', () => {
    expect(measuredWidthMm({ xMm: 2.5, yMm: 0 }, holes, 4.48)).toBe(11);
    expect(measuredWidthMm({ xMm: -1, yMm: 0 }, holes, 4.48)).toBe(6);
  });
  it('is null when no measured hole is close enough', () => {
    expect(measuredWidthMm({ xMm: 20, yMm: 0 }, holes, 4.48)).toBeNull();
  });
});

describe('doublePunchProposal (M21 step 3)', () => {
  const auto = { multiplicity: 1, source: 'auto' as const };
  it('proposes N for a wide automatic hole', () => {
    expect(doublePunchProposal(auto, 11, HOLE_MM, false)).toBe(2);
  });
  it('proposes nothing for a hole of one shot, or one with no measured width', () => {
    expect(doublePunchProposal(auto, 5.8, HOLE_MM, false)).toBeNull();
    expect(doublePunchProposal(auto, null, HOLE_MM, false)).toBeNull();
  });
  it('never re-proposes a shot the user has set: saved manual, or changed on screen', () => {
    expect(doublePunchProposal({ multiplicity: 1, source: 'manual' }, 11, HOLE_MM, false)).toBeNull();
    expect(doublePunchProposal(auto, 11, HOLE_MM, true)).toBeNull();
  });
  it('only ever raises the count', () => {
    expect(doublePunchProposal({ multiplicity: 2, source: 'auto' }, 11, HOLE_MM, false)).toBeNull();
    expect(doublePunchProposal({ multiplicity: 2, source: 'auto' }, 16, HOLE_MM, false)).toBe(3);
  });
});
