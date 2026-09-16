import { beforeAll, describe, expect, it } from 'vitest';

import { detectAnchor, openCvAngleToSpec } from '@/lib/cv/anchor';
import type { OpenCv } from '@/lib/cv/opencv';
import type { Calibration } from '@/lib/domain/photo';

import { loadOpenCvForTests } from '../../helpers/opencv';
import { blankPaperRgba, syntheticTargetRgba, type SyntheticTargetSpec } from '../../helpers/synthetic-target';

const PRECISION: SyntheticTargetSpec = {
  template: 'precision',
  width: 1200,
  height: 1600,
  cx: 620,
  cy: 830,
  radiusPx: 260,
  axisRatio: 0.93,
  angleDeg: 0,
};

const SIGHTING: SyntheticTargetSpec = {
  template: 'sighting',
  width: 1200,
  height: 1600,
  cx: 600,
  cy: 800,
  radiusPx: 450,
  axisRatio: 0.93,
  angleDeg: 0,
};

/** The overlay prior a capture would have produced: offset (+20, -15) and a slightly wrong radius. */
function priorFor(spec: SyntheticTargetSpec, radiusPx: number): Calibration {
  return {
    cx: spec.cx + 20,
    cy: spec.cy - 15,
    radiusPx,
    axisRatio: 1,
    angleDeg: 0,
    anchorDiameterMm: spec.template === 'sighting' ? 115 : 112.4,
    source: 'overlay',
    confidence: null,
  };
}

let cv: OpenCv;

beforeAll(async () => {
  cv = await loadOpenCvForTests();
}, 60_000);

describe('openCvAngleToSpec', () => {
  it('turns a RotatedRect angle into the major-axis angle in [0, 180)', () => {
    // fitEllipse reports the width side; the major axis is the height side when height >= width.
    expect(openCvAngleToSpec(90, 399, 599)).toBeCloseTo(0, 6);
    expect(openCvAngleToSpec(30, 399, 599)).toBeCloseTo(120, 6);
    expect(openCvAngleToSpec(120, 399, 599)).toBeCloseTo(30, 6);
    expect(openCvAngleToSpec(30, 599, 399)).toBeCloseTo(30, 6);
    expect(openCvAngleToSpec(179.5, 399, 599)).toBeCloseTo(89.5, 6);
  });
});

describe('detectAnchor (M10 step 3)', () => {
  it('measures the precision aiming mark near the overlay prior', async () => {
    const img = await syntheticTargetRgba(PRECISION);
    const detection = detectAnchor(cv, img, priorFor(PRECISION, 280), 112.4);

    expect(detection).not.toBeNull();
    const cal = detection!.calibration;
    expect(Math.hypot(cal.cx - PRECISION.cx, cal.cy - PRECISION.cy)).toBeLessThanOrEqual(0.015 * PRECISION.radiusPx);
    expect(Math.abs(cal.radiusPx - PRECISION.radiusPx)).toBeLessThanOrEqual(0.02 * PRECISION.radiusPx);
    expect(cal.axisRatio).toBeCloseTo(PRECISION.axisRatio, 2);
    expect(cal.anchorDiameterMm).toBe(112.4);
    expect(cal.source).toBe('auto');
    expect(detection!.outsidePrior).toBe(false);
    expect(detection!.confidence).toBeGreaterThan(0.85);
  }, 30_000);

  it('measures the sighting disc near the overlay prior', async () => {
    const img = await syntheticTargetRgba(SIGHTING);
    const detection = detectAnchor(cv, img, priorFor(SIGHTING, 480), 115);

    expect(detection).not.toBeNull();
    const cal = detection!.calibration;
    expect(Math.hypot(cal.cx - SIGHTING.cx, cal.cy - SIGHTING.cy)).toBeLessThanOrEqual(0.015 * SIGHTING.radiusPx);
    expect(Math.abs(cal.radiusPx - SIGHTING.radiusPx)).toBeLessThanOrEqual(0.02 * SIGHTING.radiusPx);
    expect(cal.axisRatio).toBeCloseTo(SIGHTING.axisRatio, 2);
    expect(cal.anchorDiameterMm).toBe(115);
    expect(detection!.outsidePrior).toBe(false);
  }, 30_000);

  it('recovers the major-axis angle of a disc rotated 30 degrees', async () => {
    const spec = { ...PRECISION, angleDeg: 30 };
    const img = await syntheticTargetRgba(spec);
    const detection = detectAnchor(cv, img, priorFor(spec, 280), 112.4);

    expect(detection).not.toBeNull();
    expect(detection!.calibration.angleDeg).toBeCloseTo(30, 0);
    expect(Math.abs(detection!.calibration.angleDeg - 30)).toBeLessThanOrEqual(2);
  }, 30_000);

  it('returns the measured disc, not null, when the prior is far off (REV-25)', async () => {
    const img = await syntheticTargetRgba(PRECISION);
    const farPrior: Calibration = {
      ...priorFor(PRECISION, 260),
      cx: PRECISION.cx + 0.6 * PRECISION.radiusPx,
      cy: PRECISION.cy,
    };
    const detection = detectAnchor(cv, img, farPrior, 112.4);

    expect(detection).not.toBeNull();
    expect(detection!.outsidePrior).toBe(true);
    expect(Math.hypot(detection!.calibration.cx - PRECISION.cx, detection!.calibration.cy - PRECISION.cy)).toBeLessThanOrEqual(
      0.015 * PRECISION.radiusPx,
    );
  }, 30_000);

  it('resolves the anchor diameter from the template hint when asked for both sizes', async () => {
    const precision = await syntheticTargetRgba(PRECISION);
    expect(detectAnchor(cv, precision, priorFor(PRECISION, 280), 'both')?.calibration.anchorDiameterMm).toBe(112.4);

    const sighting = await syntheticTargetRgba(SIGHTING);
    expect(detectAnchor(cv, sighting, priorFor(SIGHTING, 480), 'both')?.calibration.anchorDiameterMm).toBe(115);
  }, 60_000);

  it('returns null for blank paper', async () => {
    const img = await blankPaperRgba(1200, 1600);
    expect(detectAnchor(cv, img, priorFor(PRECISION, 280), 112.4)).toBeNull();
    expect(detectAnchor(cv, img, null, 'both')).toBeNull();
  }, 30_000);
});
