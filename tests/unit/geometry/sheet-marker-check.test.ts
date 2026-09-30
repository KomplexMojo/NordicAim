import { describe, expect, it } from 'vitest';

import { markerCornersMm } from '@/lib/cv/sheet-markers';
import { mmToPxH, type Homography } from '@/lib/geometry/homography';
import { homographyFromPoints } from '@/lib/geometry/point-homography';
import { MARKER_DISAGREE_MM, markerAlignmentGapMm } from '@/lib/geometry/sheet-marker-check';
import { mmToPx, type CalibrationLike } from '@/lib/geometry/transform';

// Issue #65 (REV-144): fitting the sheet's markers, and comparing that fit with the ring alignment.

const TILTED: Homography = [4.1, 0.3, 610, -0.2, -4.4, 820, 0.0004, -0.0002, 1];

const CAL: CalibrationLike = {
  cx: 620,
  cy: 830,
  radiusPx: 260,
  axisRatio: 0.93,
  angleDeg: 12,
  anchorDiameterMm: 112.4,
  perspective: null,
};

function markersFrom(
  toPx: (p: { xMm: number; yMm: number }) => { x: number; y: number },
  corners: ReadonlyArray<0 | 1 | 2 | 3> = [0, 1, 2, 3],
) {
  return corners.map((corner) => ({ corner, corners: markerCornersMm(corner).map(toPx) }));
}

describe('homographyFromPoints', () => {
  it('recovers a perspective mapping exactly from four or more correspondences', () => {
    const mm = [
      { xMm: -95, yMm: 115 },
      { xMm: 95, yMm: 115 },
      { xMm: 95, yMm: -115 },
      { xMm: -95, yMm: -115 },
      { xMm: 10, yMm: 20 },
    ];
    const h = homographyFromPoints(mm.map((p) => ({ mm: p, px: mmToPxH(p, TILTED) })));
    expect(h).not.toBeNull();
    for (const p of [{ xMm: 0, yMm: 0 }, { xMm: 57.5, yMm: -30 }, { xMm: -80, yMm: 100 }]) {
      const want = mmToPxH(p, TILTED);
      const got = mmToPxH(p, h!);
      expect(got.x).toBeCloseTo(want.x, 6);
      expect(got.y).toBeCloseTo(want.y, 6);
    }
  });

  it('is null with fewer than four points, or when they are all on one line', () => {
    const line = [0, 1, 2, 3, 4].map((i) => ({ mm: { xMm: i, yMm: i }, px: { x: i * 2, y: i * 2 } }));
    expect(homographyFromPoints(line.slice(0, 3))).toBeNull();
    expect(homographyFromPoints(line)).toBeNull();
  });
});

describe('markerAlignmentGapMm', () => {
  it('is 0 when the markers sit exactly where the alignment puts them', () => {
    expect(markerAlignmentGapMm(markersFrom((p) => mmToPx(p, CAL)), CAL)).toBeCloseTo(0, 6);
  });

  it('measures a shift in millimetres at the markers’ own scale', () => {
    const shifted = markersFrom((p) => mmToPx({ xMm: p.xMm + 10, yMm: p.yMm }, CAL));
    const gap = markerAlignmentGapMm(shifted, CAL)!;
    expect(gap).toBeCloseTo(10, 6);
    expect(gap).toBeGreaterThan(MARKER_DISAGREE_MM);
  });

  it('works from two markers, and is null from one', () => {
    const two = markersFrom((p) => mmToPx({ xMm: p.xMm + 3, yMm: p.yMm }, CAL), [0, 3]);
    expect(markerAlignmentGapMm(two, CAL)).toBeCloseTo(3, 6);
    expect(markerAlignmentGapMm(two.slice(0, 1), CAL)).toBeNull();
    expect(markerAlignmentGapMm([], CAL)).toBeNull();
  });
});
