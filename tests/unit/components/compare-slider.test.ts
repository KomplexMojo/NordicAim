import { describe, expect, it } from 'vitest';

import { blendLayerStyle } from '@/lib/render/diagram-overlay';

/**
 * M17 step 3 (REV-30), REV-85: the two sliders' whole behaviour is this one function: the editor reads its `clipPath` / `opacity` straight
 * onto the diagram layer. (There is no React test renderer in this repo, so the arithmetic is tested directly.)
 */
describe('blendLayerStyle: swipe', () => {
  it('0 keeps the whole diagram, 1 clips it all away, in between keeps the left share', () => {
    expect(blendLayerStyle(0, 0)).toEqual({ clipPath: 'inset(0 0% 0 0)', opacity: 1, boundaryFraction: 1 });
    expect(blendLayerStyle(0, 1)).toEqual({ clipPath: 'inset(0 100% 0 0)', opacity: 1, boundaryFraction: 0 });
    expect(blendLayerStyle(0, 0.5).clipPath).toBe('inset(0 50% 0 0)');
    expect(blendLayerStyle(0, 0.25).clipPath).toBe('inset(0 25% 0 0)');
    expect(blendLayerStyle(0, 0.75).boundaryFraction).toBe(0.25);
  });
});

describe('blendLayerStyle: fade', () => {
  it('0 is solid, 1 is gone, and the clip is untouched', () => {
    expect(blendLayerStyle(0, 0).opacity).toBe(1);
    expect(blendLayerStyle(0.5, 0).opacity).toBe(0.5);
    expect(blendLayerStyle(1, 0)).toEqual({ clipPath: 'inset(0 0% 0 0)', opacity: 0, boundaryFraction: 1 });
  });
});

describe('blendLayerStyle: both at once, and bad values', () => {
  it('a half-swiped diagram can also be half-transparent', () => {
    expect(blendLayerStyle(0.5, 0.5)).toEqual({ clipPath: 'inset(0 50% 0 0)', opacity: 0.5, boundaryFraction: 0.5 });
  });

  it('clamps to 0..1 and treats a non-finite value as 0', () => {
    expect(blendLayerStyle(0, -1).clipPath).toBe('inset(0 0% 0 0)');
    expect(blendLayerStyle(0, 2).clipPath).toBe('inset(0 100% 0 0)');
    expect(blendLayerStyle(Number.NaN, 0).opacity).toBe(1);
    expect(blendLayerStyle(3, 0).opacity).toBe(0);
  });
});
