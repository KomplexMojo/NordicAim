import { describe, expect, it } from 'vitest';

import { isTouchCredited, scoreRing } from '@/lib/scoring/precision';

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

describe('scoring/precision isTouchCredited (M24, REV-49: rendering-composite §3 item 7a)', () => {
  it('a unit at 7.05 mm scores 10 via the touch rule and is touch-credited', () => {
    expect(scoreRing(7.05, H).ring).toBe(10);
    expect(isTouchCredited(7.05, 10)).toBe(true);
  });

  it('a unit at 3.55 mm also scores 10 (with X) but sits inside ring 10\'s own circle: not touch-credited', () => {
    expect(scoreRing(3.55, H)).toEqual({ ring: 10, isX: true });
    expect(isTouchCredited(3.55, 10)).toBe(false);
  });

  it('a miss (ring 0) is never touch-credited', () => {
    expect(isTouchCredited(200, 0)).toBe(false);
  });
});
