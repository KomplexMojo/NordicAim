import { describe, expect, it } from 'vitest';

import { tagOffsetCss } from '@/lib/ui/tag-offset';

const VIEW = { x0: 0, y0: 0, x1: 1000, y1: 1000 };

describe('tagOffsetCss (REV-96)', () => {
  it('sits up and to the right by default', () => {
    expect(tagOffsetCss({ x: 500, y: 500 }, 1, VIEW)).toEqual([40, -46]);
  });

  it('flips sideways at the right edge, and down at the top edge', () => {
    expect(tagOffsetCss({ x: 990, y: 500 }, 1, VIEW)).toEqual([-40, -46]);
    expect(tagOffsetCss({ x: 500, y: 10 }, 1, VIEW)).toEqual([40, 46]);
    expect(tagOffsetCss({ x: 990, y: 10 }, 1, VIEW)).toEqual([-40, 46]);
  });

  it('uses on-screen pixels, so a zoomed-in view (larger scale) keeps the same offset', () => {
    expect(tagOffsetCss({ x: 500, y: 500 }, 6, { x0: 480, y0: 480, x1: 540, y1: 540 })).toEqual([40, -46]);
  });

  it('falls back to the default when nothing fits or nothing is known', () => {
    expect(tagOffsetCss({ x: 5, y: 5 }, 1, { x0: 0, y0: 0, x1: 10, y1: 10 })).toEqual([40, -46]);
    expect(tagOffsetCss({ x: 5, y: 5 }, 1, null)).toEqual([40, -46]);
  });
});
