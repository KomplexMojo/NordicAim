// M18 step 2: fitting the mm -> px mapping to points measured on concentric printed circles.
// These tests use exact points (no image), so any error is the fitter's own.

import { describe, expect, it } from 'vitest';

import { fitCircleHomography, modelCentrePx, radialErrorsMm, type CirclePoint } from '@/lib/geometry/fit-homography';
import {
  homographyFromCalibration,
  mmToPxH,
  multiplyHomography,
  pxToMmH,
  type Homography,
} from '@/lib/geometry/homography';
import type { CalibrationLike } from '@/lib/geometry/transform';

const PRECISION_RADII_MM = [2.5, 5.2, 13.2, 21.2, 29.2, 37.2, 45.2, 53.2, 56.2, 61.2, 69.2, 77.2];
const POINTS_PER_CIRCLE = 64;

/** A sheet tilted `tiltDeg` away from the camera at `distanceMm`, 4.6 px/mm at its centre. */
function tilted(tiltDeg: number, distanceMm = 600): Homography {
  const t = (tiltDeg * Math.PI) / 180;
  const f = 4.6 * distanceMm;
  return multiplyHomography(
    [1, 0, 620, 0, 1, 830, 0, 0, 1],
    [f, 0, 0, 0, -f * Math.cos(t), 0, 0, Math.sin(t), distanceMm],
  );
}

function circlePoints(h: Homography, radii: readonly number[] = PRECISION_RADII_MM): CirclePoint[] {
  const points: CirclePoint[] = [];
  for (const rMm of radii) {
    for (let i = 0; i < POINTS_PER_CIRCLE; i += 1) {
      const angle = (2 * Math.PI * i) / POINTS_PER_CIRCLE;
      const p = mmToPxH({ xMm: rMm * Math.cos(angle), yMm: rMm * Math.sin(angle) }, h);
      points.push({ x: p.x, y: p.y, rMm });
    }
  }
  return points;
}

/** The ellipse calibration a detector would produce: the same scale and centre, no perspective. */
const ROUGH: CalibrationLike = {
  cx: 628,
  cy: 822,
  radiusPx: 4.6 * 56.2,
  axisRatio: 1,
  angleDeg: 0,
  anchorDiameterMm: 112.4,
};

/** How far the model's centre is from the truth's, in mm of the truth's own target frame. */
function centreErrorMm(model: Homography, truth: Homography): number {
  const mm = pxToMmH(modelCentrePx(model), truth);
  return Math.hypot(mm.xMm, mm.yMm);
}

describe('fitCircleHomography', () => {
  it('recovers a 25° tilt exactly from concentric circles', () => {
    const truth = tilted(25);
    const fit = fitCircleHomography(circlePoints(truth), homographyFromCalibration(ROUGH));
    expect(fit.rmsMm).toBeLessThan(1e-6);
    expect(centreErrorMm(fit.homography, truth)).toBeLessThan(1e-4);
  });

  it('puts every ring back where it was drawn, at the centre and at the edge', () => {
    const truth = tilted(25);
    const points = circlePoints(truth);
    const fit = fitCircleHomography(points, homographyFromCalibration(ROUGH));
    for (const rMm of [5.2, 56.2, 77.2]) {
      const errors = radialErrorsMm(points.filter((p) => p.rMm === rMm), fit.homography);
      expect(Math.max(...errors.map(Math.abs))).toBeLessThan(1e-5);
    }
  });

  it('does not rotate the target frame, which concentric circles cannot constrain', () => {
    const truth = tilted(25);
    const init = homographyFromCalibration(ROUGH);
    const fit = fitCircleHomography(circlePoints(truth), init);
    // A rotation of the mm frame would swing every shot around the centre while fitting the rings
    // just as well; the gauge fix keeps +x mm pointing where the init put it.
    const a = mmToPxH({ xMm: 40, yMm: 0 }, fit.homography);
    const b = mmToPxH({ xMm: 40, yMm: 0 }, truth);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.05);
  });

  it('affineOnly cannot fit a tilted sheet, and its centre is off by millimetres', () => {
    const truth = tilted(25);
    const points = circlePoints(truth);
    const ellipse = fitCircleHomography(points, homographyFromCalibration(ROUGH), { affineOnly: true });
    const projective = fitCircleHomography(points, homographyFromCalibration(ROUGH));
    expect(ellipse.rmsMm).toBeGreaterThan(0.5);
    expect(centreErrorMm(ellipse.homography, truth)).toBeGreaterThan(0.5);
    expect(projective.rmsMm).toBeLessThan(ellipse.rmsMm / 100);
  });

  it('affineOnly reproduces an ellipse model exactly when the sheet is square on', () => {
    const truth = tilted(0);
    const points = circlePoints(truth);
    const ellipse = fitCircleHomography(points, homographyFromCalibration(ROUGH), { affineOnly: true });
    const projective = fitCircleHomography(points, homographyFromCalibration(ROUGH));
    expect(ellipse.rmsMm).toBeLessThan(1e-6);
    // M18 Tests: "an untilted synthetic sheet: both models agree within 0.2 mm".
    for (const p of [
      { xMm: 0, yMm: 0 },
      { xMm: 5.2, yMm: 0 },
      { xMm: -40, yMm: 30 },
    ]) {
      const a = mmToPxH(p, ellipse.homography);
      const b = mmToPxH(p, projective.homography);
      expect(Math.hypot(a.x - b.x, a.y - b.y) / 4.6).toBeLessThan(0.2);
    }
  });

  it('ignores rays that latched onto the wrong thing', () => {
    const truth = tilted(25);
    const points = circlePoints(truth);
    // One ray in twelve reads 4 mm short — a shot hole or a numeral, not the ring line.
    const corrupted = points.map((p, i) =>
      i % 12 === 0 ? { ...p, x: p.x + 4 * 4.6, y: p.y - 2 * 4.6 } : p,
    );
    const robust = fitCircleHomography(corrupted, homographyFromCalibration(ROUGH));
    const plain = fitCircleHomography(corrupted, homographyFromCalibration(ROUGH), { robust: false });
    expect(centreErrorMm(robust.homography, truth)).toBeLessThan(0.05);
    expect(centreErrorMm(robust.homography, truth)).toBeLessThan(centreErrorMm(plain.homography, truth));
    expect(robust.usedPoints).toBeLessThan(corrupted.length);
  });

  it('refuses a fit with fewer points than parameters', () => {
    const points = circlePoints(tilted(10), [56.2]).slice(0, 5);
    expect(() => fitCircleHomography(points, homographyFromCalibration(ROUGH))).toThrow(/fewer than/);
  });
});
