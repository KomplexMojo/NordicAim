import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { detectAnchor, openCvAngleToSpec } from '@/lib/cv/anchor';
import type { OpenCv } from '@/lib/cv/opencv';
import type { Calibration } from '@/lib/domain/photo';
import type { RgbaImage } from '@/lib/media/format';

import { loadOpenCvForTests } from '../../helpers/opencv';
import { jpegFileToRgba } from '../../helpers/rgba';
import {
  blankPaperRgba,
  bridgedPrecisionRgba,
  syntheticTargetRgba,
  type SyntheticTargetSpec,
} from '../../helpers/synthetic-target';

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

/**
 * REV-26. On the bridged sheet the printed rings weld to the aiming mark once the CLOSE runs, so the
 * outermost dark shape measures ~25% too large. The fill guard must reject it at every kernel size, and
 * the nested search must return the aiming mark inside it.
 */
describe('detectAnchor on a merged shape (REV-26)', () => {
  /** A prior this much larger than the disc makes `round(0.08 * guessR)` exactly 30 (detection scale 0.75). */
  const PRIOR_RADIUS_FOR_KERNEL_30 = 500;
  /** What the merged outer contour measures — the value that must never be returned. */
  const MERGED_RADIUS_PX = 324;

  it('rejects the merged outer shape and returns the inner aiming mark at kernel 9', async () => {
    const img = await bridgedPrecisionRgba(PRECISION);
    // No prior: guessR is 0, so the CLOSE kernel is the floor, 9.
    const detection = detectAnchor(cv, img, null, 112.4);

    expect(detection).not.toBeNull();
    const cal = detection!.calibration;
    expect(Math.abs(cal.radiusPx - PRECISION.radiusPx)).toBeLessThanOrEqual(0.02 * PRECISION.radiusPx);
    expect(Math.abs(cal.radiusPx - MERGED_RADIUS_PX)).toBeGreaterThan(0.1 * PRECISION.radiusPx);
    expect(cal.source).toBe('auto');
    expect(detection!.confidence).toBeGreaterThanOrEqual(0.85);
  }, 60_000);

  it('rejects the merged outer shape at the capture-prior kernel 30 as well', async () => {
    const img = await bridgedPrecisionRgba(PRECISION);
    const detection = detectAnchor(cv, img, priorFor(PRECISION, PRIOR_RADIUS_FOR_KERNEL_30), 112.4);

    expect(detection).not.toBeNull();
    const cal = detection!.calibration;
    expect(Math.abs(cal.radiusPx - PRECISION.radiusPx)).toBeLessThanOrEqual(0.02 * PRECISION.radiusPx);
    expect(Math.abs(cal.radiusPx - MERGED_RADIUS_PX)).toBeGreaterThan(0.1 * PRECISION.radiusPx);
    expect(cal.source).toBe('auto');
  }, 60_000);
});

/**
 * REV-26 / M10 step 10. The committed reference JPEGs against the seed calibrations, at the tolerance
 * `pnpm cv:eval` gates on. `IMG_5132-precision.jpg` is the photo whose ring numbers bridge the aiming
 * mark; `IMG_5057-sighting.jpg` has no merged shape, so the nested search must leave it alone.
 */
describe('detectAnchor on the reference photos (REV-26)', () => {
  const CENTRE_TOLERANCE = 0.05; // fraction of R
  const RADIUS_TOLERANCE = 0.06;

  interface Seed {
    cx: number;
    cy: number;
    radiusPx: number;
    anchorDiameterMm: number;
  }

  const seeds = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../fixtures/reference/seed-calibrations.json', import.meta.url)), 'utf-8'),
  ) as Record<string, Seed | string>;

  function seedFor(key: string): Seed {
    const seed = seeds[key];
    if (seed === undefined || typeof seed === 'string') throw new Error(`no seed calibration for ${key}`);
    return seed;
  }

  function expectWithinTolerance(cal: Calibration, seed: Seed): void {
    expect(Math.hypot(cal.cx - seed.cx, cal.cy - seed.cy)).toBeLessThanOrEqual(CENTRE_TOLERANCE * seed.radiusPx);
    expect(Math.abs(cal.radiusPx - seed.radiusPx)).toBeLessThanOrEqual(RADIUS_TOLERANCE * seed.radiusPx);
  }

  function referencePrior(seed: Seed): Calibration {
    // An overlay the user framed loosely — the case REV-26 is about: the prior is ~40% larger than the
    // disc, so the CLOSE kernel grows and the printed rings merge into the aiming mark.
    return {
      cx: seed.cx + 20,
      cy: seed.cy - 15,
      radiusPx: Math.round(seed.radiusPx * 1.4),
      axisRatio: 1,
      angleDeg: 0,
      anchorDiameterMm: seed.anchorDiameterMm,
      source: 'overlay',
      confidence: null,
    };
  }

  async function referenceImage(name: string): Promise<RgbaImage> {
    return jpegFileToRgba(fileURLToPath(new URL(`../../../docs/reference/${name}`, import.meta.url)));
  }

  it('measures the precision aiming mark, not the merged shape, with no prior', async () => {
    const seed = seedFor('IMG_5132-precision.jpg');
    const detection = detectAnchor(cv, await referenceImage('IMG_5132-precision.jpg'), null, 'both');

    expect(detection).not.toBeNull();
    expectWithinTolerance(detection!.calibration, seed);
  }, 120_000);

  it('measures the precision aiming mark with a capture prior', async () => {
    const seed = seedFor('IMG_5132-precision.jpg');
    const detection = detectAnchor(cv, await referenceImage('IMG_5132-precision.jpg'), referencePrior(seed), 112.4);

    expect(detection).not.toBeNull();
    expectWithinTolerance(detection!.calibration, seed);
  }, 120_000);

  it('leaves the sighting disc unchanged (no merged shape to look inside)', async () => {
    const seed = seedFor('IMG_5057-sighting.jpg');
    const img = await referenceImage('IMG_5057-sighting.jpg');

    const noPrior = detectAnchor(cv, img, null, 'both');
    expect(noPrior).not.toBeNull();
    expectWithinTolerance(noPrior!.calibration, seed);

    const withPrior = detectAnchor(cv, img, referencePrior(seed), 115);
    expect(withPrior).not.toBeNull();
    expectWithinTolerance(withPrior!.calibration, seed);
  }, 120_000);
});
