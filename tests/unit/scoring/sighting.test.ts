import { describe, expect, it } from 'vitest';

import { isTouchCredited, zoneFor } from '@/lib/scoring/sighting';

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

describe('scoring/sighting isTouchCredited (M24, REV-49: rendering-composite §3 item 7a)', () => {
  it('a prone unit at 23.4 mm (45 mm zone) is a touch-credited hit', () => {
    expect(zoneFor(23.4, 'prone', H)).toBe('hit');
    expect(isTouchCredited(23.4, 'hit', 'prone')).toBe(true);
  });

  it('a prone unit at 26.2 mm is a miss and unflagged', () => {
    expect(zoneFor(26.2, 'prone', H)).toBe('miss');
    expect(isTouchCredited(26.2, 'miss', 'prone')).toBe(false);
  });

  it('a clean hit is never touch-credited', () => {
    expect(isTouchCredited(10, 'clean', 'prone')).toBe(false);
  });
});
