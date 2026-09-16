import { describe, expect, it } from 'vitest';

import { RING_POLYLINE_POINTS, polylineAttr, ringPolyline, templateRingPolylines } from '@/lib/geometry/rings';
import type { CalibrationLike } from '@/lib/geometry/transform';

/** geometry-scoring §2.1's vector calibration: sighting anchor 115 mm, radius 460 px -> 8 px per mm. */
const CAL: CalibrationLike = {
  cx: 1000,
  cy: 800,
  radiusPx: 460,
  axisRatio: 1,
  angleDeg: 0,
  anchorDiameterMm: 115,
};

describe('ringPolyline (M13 step 1)', () => {
  it('samples 96 points by default and does not repeat the first one', () => {
    const points = ringPolyline(CAL, 40);
    expect(RING_POLYLINE_POINTS).toBe(96);
    expect(points).toHaveLength(96);
    expect(points[0]).not.toEqual(points[95]);
  });

  it('places the 0 deg and 90 deg samples where mmToPx does', () => {
    const points = ringPolyline(CAL, 40); // r = 20 mm -> 160 px at s = 8
    expect(points[0]?.x).toBeCloseTo(1160, 9);
    expect(points[0]?.y).toBeCloseTo(800, 9);
    // 90 deg in target space is +y (up), which is -y in image space.
    expect(points[24]?.x).toBeCloseTo(1000, 9);
    expect(points[24]?.y).toBeCloseTo(640, 9);
  });

  it('follows the calibration ellipse: at angle 90 the x offset is compressed by axisRatio', () => {
    const points = ringPolyline({ ...CAL, axisRatio: 0.5, angleDeg: 90 }, 40);
    expect(points[0]?.x).toBeCloseTo(1080, 9);
    expect(points[0]?.y).toBeCloseTo(800, 9);
  });

  it('honours an explicit step count', () => {
    expect(ringPolyline(CAL, 40, 8)).toHaveLength(8);
  });
});

describe('templateRingPolylines (capture-overlay §3.1 circle sets)', () => {
  it('draws the sighting sheet: 115 anchor, 110 guide, 45 ring, 40 guide', () => {
    const rings = templateRingPolylines(CAL, 'sighting');
    expect(rings.map((r) => r.diameterMm)).toEqual([115, 110, 45, 40]);
    expect(rings.map((r) => r.style)).toEqual(['anchor', 'guide', 'ring', 'guide']);
    expect(rings.every((r) => r.points.length === 96)).toBe(true);
  });

  it('draws the precision sheet: 154.4, 112.4 anchor, 74.4, 42.4, 10.4', () => {
    const rings = templateRingPolylines({ ...CAL, anchorDiameterMm: 112.4 }, 'precision');
    expect(rings.map((r) => r.diameterMm)).toEqual([154.4, 112.4, 74.4, 42.4, 10.4]);
    expect(rings.map((r) => r.style)).toEqual(['ring', 'anchor', 'ring', 'ring', 'ring']);
  });
});

describe('polylineAttr', () => {
  it('formats points as "x,y" pairs with 2 decimals', () => {
    expect(polylineAttr([{ x: 1, y: 2.345 }, { x: -3.2, y: 4 }])).toBe('1.00,2.35 -3.20,4.00');
  });
});
