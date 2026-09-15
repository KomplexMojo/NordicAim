import { describe, expect, it } from 'vitest';

import { scoreRing } from '@/lib/scoring/precision';

const H = 5.6; // BIATHLON_50M.holeDiameterMm

describe('scoring/precision scoreRing (geometry-scoring.md §4)', () => {
  it.each([
    [0, { ring: 10, isX: true }],
    [5.3, { ring: 10, isX: true }],
    [5.31, { ring: 10, isX: false }],
    [8.0, { ring: 10, isX: false }],
    [8.01, { ring: 9, isX: false }],
    [16.0, { ring: 9, isX: false }],
    [24.0, { ring: 8, isX: false }],
    [24.0001, { ring: 7, isX: false }],
    [40, { ring: 6, isX: false }],
    [79.99, { ring: 1, isX: false }],
    [80.0, { ring: 1, isX: false }],
    [80.01, { ring: 0, isX: false }],
  ])('scoreRing(%f) -> %o', (radialMm, expected) => {
    expect(scoreRing(radialMm, H)).toEqual(expected);
  });

  it('holeDiameterMm defaults to BIATHLON_50M.holeDiameterMm, matching the spec unary call form scoreRing(radialMm)', () => {
    expect(scoreRing(8.0)).toEqual({ ring: 10, isX: false });
    expect(scoreRing(8.01)).toEqual({ ring: 9, isX: false });
  });
});
