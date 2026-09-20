import { describe, expect, it } from 'vitest';

import { atEnd, SLIDE_END_FRACTION, slideFraction } from '@/lib/ui/slide';

describe('slide gesture (REV-75)', () => {
  // A 300 px track with a 56 px handle: 244 px of travel; the finger grabbed the handle 20 px in from its left edge.
  const f = (clientX: number) => slideFraction(clientX, 20, 100, 300, 56);

  it('is 0 at the start and before it, 1 at the end and beyond', () => {
    expect(f(120)).toBe(0);
    expect(f(0)).toBe(0);
    expect(f(120 + 244)).toBe(1);
    expect(f(9999)).toBe(1);
  });

  it('is proportional in between', () => {
    expect(f(120 + 122)).toBeCloseTo(0.5, 10);
  });

  it('a track no wider than the handle cannot slide', () => {
    expect(slideFraction(500, 0, 0, 56, 56)).toBe(0);
  });

  it('counts as at the end only near the very end', () => {
    expect(atEnd(SLIDE_END_FRACTION)).toBe(true);
    expect(atEnd(1)).toBe(true);
    expect(atEnd(0.9)).toBe(false);
  });
});
