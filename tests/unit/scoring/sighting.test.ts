import { describe, expect, it } from 'vitest';

import { zoneFor } from '@/lib/scoring/sighting';

const H = 5.6; // BIATHLON_50M.holeDiameterMm

describe('scoring/sighting zoneFor (geometry-scoring.md §5)', () => {
  it.each([
    [0, 'clean'],
    [20.0, 'clean'],
    [20.01, 'hit'],
    [25.3, 'hit'],
    [25.31, 'miss'],
  ] as const)('prone: zoneFor(%f) -> %s', (radialMm, expected) => {
    expect(zoneFor(radialMm, 'prone', H)).toBe(expected);
  });

  it.each([
    [55.0, 'clean'],
    [60.3, 'hit'],
    [60.31, 'miss'],
  ] as const)('standing: zoneFor(%f) -> %s', (radialMm, expected) => {
    expect(zoneFor(radialMm, 'standing', H)).toBe(expected);
  });
});
