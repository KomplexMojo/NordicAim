// M18 step 2: the projective mm <-> px mapping. The spec vectors are geometry-scoring §2.1's, because
// the homography built from a calibration must agree with `mmToPx` exactly — an ellipse calibration is
// a homography whose last row is (0, 0, 1).

import { describe, expect, it } from 'vitest';

import {
  affinePartAtCentre,
  alignRotationGauge,
  calibrationFromHomography,
  centrePx,
  homographyFromCalibration,
  invertHomography,
  jacobianAtCentre,
  mmToPxH,
  multiplyHomography,
  perspectiveMm,
  pxToMmH,
  rotationMm,
  type Homography,
} from '@/lib/geometry/homography';
import { mmToPx, pxToMm, type CalibrationLike } from '@/lib/geometry/transform';

const SIGHTING: CalibrationLike = { cx: 1000, cy: 800, radiusPx: 460, axisRatio: 1, angleDeg: 0, anchorDiameterMm: 115 };
const COMPRESSED: CalibrationLike = { ...SIGHTING, axisRatio: 0.5, angleDeg: 90 };

/** A sheet tilted away from the camera: 8 px/mm at the centre, 700 mm away, 20 degrees of tilt. */
function tilted(): Homography {
  const t = (20 * Math.PI) / 180;
  const f = 8 * 700;
  return multiplyHomography(
    [1, 0, 1000, 0, 1, 800, 0, 0, 1],
    [f, 0, 0, 0, -f * Math.cos(t), 0, 0, Math.sin(t), 700],
  );
}

describe('homographyFromCalibration', () => {
  it('reproduces geometry-scoring §2.1 vector: the centre maps to (cx, cy)', () => {
    const h = homographyFromCalibration(SIGHTING);
    const p = mmToPxH({ xMm: 0, yMm: 0 }, h);
    expect(p.x).toBeCloseTo(1000, 9);
    expect(p.y).toBeCloseTo(800, 9);
    expect(centrePx(h).x).toBeCloseTo(1000, 9);
    expect(centrePx(h).y).toBeCloseTo(800, 9);
  });

  it('reproduces geometry-scoring §2.1 vector: (10, 5) mm -> (1080, 760) px at s = 8', () => {
    const p = mmToPxH({ xMm: 10, yMm: 5 }, homographyFromCalibration(SIGHTING));
    expect(p.x).toBeCloseTo(1080, 9);
    expect(p.y).toBeCloseTo(760, 9);
  });

  it('reproduces geometry-scoring §2.1 vector: (1080, 760) px -> (10, 5) mm', () => {
    const mm = pxToMmH({ x: 1080, y: 760 }, homographyFromCalibration(SIGHTING));
    expect(mm.xMm).toBeCloseTo(10, 9);
    expect(mm.yMm).toBeCloseTo(5, 9);
  });

  it('reproduces geometry-scoring §2.1 vector: axisRatio 0.5, angleDeg 90 -> (1040, 760)', () => {
    const h = homographyFromCalibration(COMPRESSED);
    const p = mmToPxH({ xMm: 10, yMm: 5 }, h);
    expect(p.x).toBeCloseTo(1040, 9);
    expect(p.y).toBeCloseTo(760, 9);
    const back = pxToMmH({ x: 1040, y: 760 }, h);
    expect(back.xMm).toBeCloseTo(10, 9);
    expect(back.yMm).toBeCloseTo(5, 9);
  });

  it('agrees with mmToPx / pxToMm everywhere, not only at the vectors', () => {
    for (const cal of [SIGHTING, COMPRESSED, { ...SIGHTING, axisRatio: 0.82, angleDeg: 37 }]) {
      const h = homographyFromCalibration(cal);
      for (const p of [
        { xMm: 0, yMm: 0 },
        { xMm: 57.5, yMm: 0 },
        { xMm: -20.25, yMm: 44.5 },
        { xMm: 12.75, yMm: -31.5 },
      ]) {
        const a = mmToPx(p, cal);
        const b = mmToPxH(p, h);
        expect(b.x).toBeCloseTo(a.x, 9);
        expect(b.y).toBeCloseTo(a.y, 9);
        const back = pxToMmH(b, h);
        const expected = pxToMm(a, cal);
        expect(back.xMm).toBeCloseTo(expected.xMm, 9);
        expect(back.yMm).toBeCloseTo(expected.yMm, 9);
      }
    }
  });
});

describe('the projective model round-trips', () => {
  // M18 Tests: "mmToPx ∘ pxToMm round-trips within 1e-6 mm under the new model."
  it('pxToMmH(mmToPxH(p)) === p within 1e-6 mm for 100 points under a tilted model', () => {
    const h = tilted();
    const inverse = invertHomography(h);
    for (let i = 0; i < 100; i += 1) {
      // Deterministic sweep, no Math.random: a spiral over the whole scoring area.
      const angle = (i * 2 * Math.PI * 7) / 100;
      const r = (i / 99) * 80;
      const p = { xMm: r * Math.cos(angle), yMm: r * Math.sin(angle) };
      const back = pxToMmH(mmToPxH(p, h), h, inverse);
      expect(Math.abs(back.xMm - p.xMm)).toBeLessThan(1e-6);
      expect(Math.abs(back.yMm - p.yMm)).toBeLessThan(1e-6);
    }
  });

  it('inverts and multiplies back to the identity', () => {
    const h = tilted();
    const product = multiplyHomography(h, invertHomography(h));
    for (const [i, expected] of [1, 0, 0, 0, 1, 0, 0, 0, 1].entries()) {
      expect(product[i] as number).toBeCloseTo(expected, 9);
    }
  });

  it('a tilted model is not affine: its last row is non-zero', () => {
    const h = tilted();
    expect(Math.abs(h[6]) + Math.abs(h[7])).toBeGreaterThan(0);
  });
});

describe('affinePartAtCentre', () => {
  it('leaves an affine model alone', () => {
    const h = homographyFromCalibration(COMPRESSED);
    const affine = affinePartAtCentre(h);
    for (const [i, value] of h.entries()) expect(affine[i] as number).toBeCloseTo(value, 9);
  });

  it('drops the perspective terms but keeps the centre and the local frame', () => {
    const h = tilted();
    const affine = affinePartAtCentre(h);
    expect(affine[6]).toBe(0);
    expect(affine[7]).toBe(0);
    expect(centrePx(affine).x).toBeCloseTo(centrePx(h).x, 9);
    expect(centrePx(affine).y).toBeCloseTo(centrePx(h).y, 9);
    for (const [i, value] of jacobianAtCentre(h).entries()) {
      expect((jacobianAtCentre(affine)[i] as number)).toBeCloseTo(value, 9);
    }
  });
});

describe('alignRotationGauge', () => {
  it('undoes a rotation of the target frame, which concentric circles cannot see', () => {
    const reference = homographyFromCalibration(SIGHTING);
    const rotated = multiplyHomography(reference, rotationMm(23));
    const pinned = alignRotationGauge(rotated, reference);
    for (const p of [
      { xMm: 30, yMm: 0 },
      { xMm: 0, yMm: -18 },
    ]) {
      const a = mmToPxH(p, pinned);
      const b = mmToPxH(p, reference);
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
  });

  it('leaves the centre and the perspective terms untouched', () => {
    const h = multiplyHomography(tilted(), rotationMm(41));
    const pinned = alignRotationGauge(h, homographyFromCalibration(SIGHTING));
    expect(centrePx(pinned).x).toBeCloseTo(centrePx(h).x, 6);
    expect(centrePx(pinned).y).toBeCloseTo(centrePx(h).y, 6);
    // Still projective: a rotation in the target plane cannot flatten a tilted sheet.
    expect(Math.abs(pinned[6]) + Math.abs(pinned[7])).toBeGreaterThan(0);
  });
});

describe('perspectiveMm', () => {
  it('is the identity at (0, 0) and sends the vanishing line to infinity', () => {
    const flat = perspectiveMm(0, 0);
    expect(flat).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const p = perspectiveMm(0.01, 0);
    // The point 100 mm along +x has w = 1 + 0.01 * 100 = 2, so it maps to half the distance.
    const mapped = mmToPxH({ xMm: 100, yMm: 0 }, p);
    expect(mapped.x).toBeCloseTo(50, 9);
  });
});

describe('REV-44: the stored seven numbers', () => {
  const CAL: CalibrationLike = {
    cx: 600,
    cy: 800,
    radiusPx: 260,
    axisRatio: 0.82,
    angleDeg: 37,
    anchorDiameterMm: 112.4,
    perspective: { p: 2e-4, q: -7e-4 },
  };
  const RING_POINTS = [5.2, 50, 80].flatMap((r) =>
    Array.from({ length: 36 }, (_, k) => ({ r, xMm: r * Math.cos((k * Math.PI) / 18), yMm: r * Math.sin((k * Math.PI) / 18) })),
  );

  it('homographyFromCalibration applies the perspective exactly as mmToPx does', () => {
    const h = homographyFromCalibration(CAL);
    for (const p of RING_POINTS) {
      const a = mmToPxH(p, h);
      const b = mmToPx(p, CAL);
      expect(a.x).toBeCloseTo(b.x, 9);
      expect(a.y).toBeCloseTo(b.y, 9);
    }
  });

  it('calibrationFromHomography reads the seven numbers back out', () => {
    const back = calibrationFromHomography(homographyFromCalibration(CAL), CAL.anchorDiameterMm)!;
    expect(back.cx).toBeCloseTo(600, 9);
    expect(back.cy).toBeCloseTo(800, 9);
    expect(back.radiusPx).toBeCloseTo(260, 9);
    expect(back.axisRatio).toBeCloseTo(0.82, 9);
    expect(back.angleDeg).toBeCloseTo(37, 9);
    expect(back.perspective!.p).toBeCloseTo(2e-4, 12);
    expect(back.perspective!.q).toBeCloseTo(-7e-4, 12);
  });

  it('drops the unobservable in-plane rotation: every ring lands on the same conic', () => {
    for (const deg of [11, -63, 170]) {
      const h = multiplyHomography(homographyFromCalibration(CAL), rotationMm(deg));
      const cal = { ...CAL, ...calibrationFromHomography(h, CAL.anchorDiameterMm)! };
      for (const p of RING_POINTS) {
        const px = mmToPxH(p, h);
        const mm = pxToMm(px, cal);
        expect(Math.abs(Math.hypot(mm.xMm, mm.yMm) - p.r)).toBeLessThan(1e-9);
      }
    }
  });

  it('a fitted tilted sheet decomposes into a calibration that reproduces it', () => {
    const h = tilted();
    const cal = { ...CAL, ...calibrationFromHomography(h, CAL.anchorDiameterMm)! };
    expect(cal.perspective).not.toBeNull();
    for (const p of RING_POINTS) {
      const mm = pxToMm(mmToPxH(p, h), cal);
      expect(Math.abs(Math.hypot(mm.xMm, mm.yMm) - p.r)).toBeLessThan(1e-9);
    }
    // The centre is the image of the target centre, not an ellipse centre.
    expect(mmToPx({ xMm: 0, yMm: 0 }, cal).x).toBeCloseTo(centrePx(h).x, 9);
    expect(mmToPx({ xMm: 0, yMm: 0 }, cal).y).toBeCloseTo(centrePx(h).y, 9);
  });

  it('an ellipse calibration decomposes with a zero perspective', () => {
    const back = calibrationFromHomography(homographyFromCalibration(COMPRESSED), 115)!;
    expect(back.perspective).toEqual({ p: 0, q: 0 });
    expect(back.axisRatio).toBeCloseTo(0.5, 9);
    expect(back.angleDeg).toBeCloseTo(90, 9);
  });

  it('refuses a mirrored or over-flattened homography', () => {
    const mirrored: Homography = [8, 0, 1000, 0, 8, 800, 0, 0, 1]; // no y flip: +y up in the image
    expect(calibrationFromHomography(mirrored, 115)).toBeNull();
    const flat: Homography = [8, 0, 1000, 0, -1, 800, 0, 0, 1];
    expect(calibrationFromHomography(flat, 115)).toBeNull();
  });
});
