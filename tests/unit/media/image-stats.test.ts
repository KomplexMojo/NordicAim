import { describe, expect, it } from 'vitest';

import { computeImageStats } from '@/lib/media/image-stats';
import type { RgbaImage } from '@/lib/media/format';

/** metadata-lighting §3 vector: 100x100, left 50 columns rgb(250,200,150), right 50 columns rgb(20,20,20). */
function vectorImage(): RgbaImage {
  const width = 100;
  const height = 100;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const bright = x < 50;
      data[o] = bright ? 250 : 20;
      data[o + 1] = bright ? 200 : 20;
      data[o + 2] = bright ? 150 : 20;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('computeImageStats', () => {
  it('matches the spec vector exactly', () => {
    const stats = computeImageStats(vectorImage());
    expect(stats.brightMeanR).toBe(250);
    expect(stats.brightMeanG).toBe(200);
    expect(stats.brightMeanB).toBe(150);
    expect(stats.meanLuma).toBeCloseTo(113.51, 9);
  });
});
