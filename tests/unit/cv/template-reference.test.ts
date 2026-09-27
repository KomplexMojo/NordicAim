import { describe, expect, it } from 'vitest';

import { keepTargetCircles, REFERENCE_CROP_MARGIN_MM, REFERENCE_MARGIN_MM, referenceKeepRadiusMm, referenceRefusal } from '@/lib/cv/template-reference';
import { outerRadiusMm } from '@/lib/cv/rectify';
import type { Calibration } from '@/lib/domain/photo';
import type { RgbaImage } from '@/lib/media/format';

// template-reference.md §3 step 3. A 900 x 900 sheet at 4 px/mm: paper (200, 198, 190), the 115 mm sighting disc in
// black at the centre, and a red mark 64 mm right of the centre: inside the crop (67.5 mm) but outside the kept
// radius (57.5 + 3 mm).
const PX_PER_MM = 4;
const SIDE = 900;
const CENTRE = 450;
const CAL: Calibration = {
  cx: CENTRE,
  cy: CENTRE,
  radiusPx: (115 / 2) * PX_PER_MM,
  axisRatio: 1,
  angleDeg: 0,
  anchorDiameterMm: 115,
  source: 'auto',
  confidence: null,
  perspective: null,
};
const PAPER = [200, 198, 190] as const;

function sheet(): RgbaImage {
  const data = new Uint8ClampedArray(SIDE * SIDE * 4);
  for (let y = 0; y < SIDE; y += 1) {
    for (let x = 0; x < SIDE; x += 1) {
      const i = (y * SIDE + x) * 4;
      const rMm = Math.hypot(x - CENTRE, y - CENTRE) / PX_PER_MM;
      const mark = Math.abs(x - (CENTRE + 64 * PX_PER_MM)) < 8 && Math.abs(y - CENTRE) < 8;
      const rgb = rMm <= 57.5 ? [10, 10, 10] : mark ? [200, 30, 30] : PAPER;
      data[i] = rgb[0]!;
      data[i + 1] = rgb[1]!;
      data[i + 2] = rgb[2]!;
      data[i + 3] = 255;
    }
  }
  return { data, width: SIDE, height: SIDE };
}

function pixel(img: RgbaImage, x: number, y: number): number[] {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
}

describe('keepTargetCircles (template-reference.md §3 step 3)', () => {
  it('keeps the outermost circle plus the 3 mm margin', () => {
    expect(REFERENCE_MARGIN_MM).toBe(3);
    expect(referenceKeepRadiusMm('sighting')).toBeCloseTo(outerRadiusMm('sighting') + 3, 9);
    expect(referenceKeepRadiusMm('precision')).toBeCloseTo(outerRadiusMm('precision') + 3, 9);
  });

  it('crops a square of half-side outerRadiusMm + 10 mm around the centre', () => {
    const { image, origin } = keepTargetCircles(sheet(), CAL, 'sighting');
    const half = Math.round((outerRadiusMm('sighting') + REFERENCE_CROP_MARGIN_MM) * PX_PER_MM);
    expect(image.width).toBe(2 * half);
    expect(image.height).toBe(2 * half);
    expect(origin).toEqual({ x: CENTRE - half, y: CENTRE - half });
  });

  it('keeps the disc and paints the paper beyond the kept radius with the paper colour', () => {
    const { image, origin, paper } = keepTargetCircles(sheet(), CAL, 'sighting');
    expect(paper).toEqual([...PAPER]);
    const at = (xMm: number, yMm: number) =>
      pixel(image, Math.round(CENTRE + xMm * PX_PER_MM) - origin.x, Math.round(CENTRE - yMm * PX_PER_MM) - origin.y);
    expect(at(0, 0)).toEqual([10, 10, 10]); // the disc
    expect(at(50, 0)).toEqual([10, 10, 10]);
    expect(at(0, 66)).toEqual([...PAPER]); // beyond 60.5 mm
  });

  it('removes a mark outside the circles', () => {
    const src = sheet();
    const { image, origin } = keepTargetCircles(src, CAL, 'sighting');
    expect(pixel(src, CENTRE + 64 * PX_PER_MM, CENTRE)).toEqual([200, 30, 30]);
    expect(pixel(image, CENTRE + 64 * PX_PER_MM - origin.x, CENTRE - origin.y)).toEqual([...PAPER]);
    let red = 0;
    for (let i = 0; i < image.data.length; i += 4) if (image.data[i] === 200 && image.data[i + 1] === 30) red += 1;
    expect(red).toBe(0);
  });

  it('does not modify its input', () => {
    const src = sheet();
    const before = src.data.slice();
    keepTargetCircles(src, CAL, 'sighting');
    expect(Buffer.from(src.data).equals(Buffer.from(before))).toBe(true);
  });

  it('clamps the crop to the image when the sheet sits near an edge', () => {
    const { image, origin } = keepTargetCircles(sheet(), { ...CAL, cx: 200 }, 'sighting');
    expect(origin.x).toBe(0);
    expect(image.width).toBeLessThan(image.height);
  });
});

describe('referenceRefusal (template-reference.md §3 step 2)', () => {
  it('refuses a photo with no disc', () => {
    expect(referenceRefusal(false, null, 'sighting')).toBe('no-disc');
  });
  it('refuses when the hint names the other template with confidence >= 0.5', () => {
    expect(referenceRefusal(true, { template: 'precision', confidence: 0.5 }, 'sighting')).toBe('wrong-template');
    expect(referenceRefusal(true, { template: 'sighting', confidence: 0.99 }, 'precision')).toBe('wrong-template');
  });
  it('accepts an unsure hint, an agreeing hint, or none', () => {
    expect(referenceRefusal(true, { template: 'precision', confidence: 0.49 }, 'sighting')).toBeNull();
    expect(referenceRefusal(true, { template: 'sighting', confidence: 0.9 }, 'sighting')).toBeNull();
    expect(referenceRefusal(true, null, 'precision')).toBeNull();
  });
});
