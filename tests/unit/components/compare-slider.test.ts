import { describe, expect, it } from 'vitest';

import { compareLayerStyle } from '@/lib/render/diagram-overlay';

/**
 * M17 step 3 (REV-30). The slider's whole behaviour is this one function: the component reads its
 * `clipPath`/`opacity` straight onto the overlay layer. (There is no React test renderer in this
 * repo, so the arithmetic is tested directly — see the milestone's Open questions.)
 */
describe('compareLayerStyle: wipe (M17 step 3)', () => {
  it('0 leaves the overlay fully visible: the whole diagram', () => {
    expect(compareLayerStyle('wipe', 0)).toEqual({
      clipPath: 'inset(0 0% 0 0)',
      opacity: 1,
      boundaryFraction: 1,
    });
  });

  it('1 clips the overlay away entirely: the whole photo', () => {
    expect(compareLayerStyle('wipe', 1)).toEqual({
      clipPath: 'inset(0 100% 0 0)',
      opacity: 1,
      boundaryFraction: 0,
    });
  });

  it('0.5 keeps the left half', () => {
    expect(compareLayerStyle('wipe', 0.5)).toEqual({
      clipPath: 'inset(0 50% 0 0)',
      opacity: 1,
      boundaryFraction: 0.5,
    });
  });

  it('moves the wipe boundary across the box', () => {
    expect(compareLayerStyle('wipe', 0.25).clipPath).toBe('inset(0 25% 0 0)');
    expect(compareLayerStyle('wipe', 0.75).clipPath).toBe('inset(0 75% 0 0)');
  });
});

describe('compareLayerStyle: fade (M17 step 3, REV-30 fallback mode)', () => {
  it('drives the opacity instead of the clip', () => {
    expect(compareLayerStyle('fade', 0)).toEqual({ clipPath: 'none', opacity: 1, boundaryFraction: 1 });
    expect(compareLayerStyle('fade', 0.5)).toEqual({ clipPath: 'none', opacity: 0.5, boundaryFraction: 0.5 });
    expect(compareLayerStyle('fade', 1)).toEqual({ clipPath: 'none', opacity: 0, boundaryFraction: 0 });
  });
});

describe('compareLayerStyle: out-of-range values', () => {
  it('clamps to 0..1 and treats a non-finite value as 0', () => {
    expect(compareLayerStyle('wipe', -1).clipPath).toBe('inset(0 0% 0 0)');
    expect(compareLayerStyle('wipe', 2).clipPath).toBe('inset(0 100% 0 0)');
    expect(compareLayerStyle('fade', Number.NaN).opacity).toBe(1);
  });
});
