// M18 Tests. The whole path on a rendered sheet: find the anchor the way the pipeline does, measure
// every printed circle, then fit both models to those points.
//
// `tests/helpers/tilted-target.ts` draws the sheet under a KNOWN homography, so the printed centre is
// exact — unlike `synthetic-target.ts`, which draws every circle with the ellipse model and therefore
// cannot pose the question at all.

import { beforeAll, describe, expect, it } from 'vitest';

import { detectAnchor } from '@/lib/cv/anchor';
import {
  centreOffsetMm,
  circleErrorMm,
  estimatePerspective,
  type PerspectiveEstimate,
} from '@/lib/cv/alignment-perspective';
import { measureRingEdges, printedCircles } from '@/lib/cv/ring-edges';
import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '@/lib/defaults/templates';
import { homographyFromCalibration, mmToPxH, pxToMmH, type Homography } from '@/lib/geometry/homography';
import type { RgbaImage } from '@/lib/media/format';

import { loadOpenCvForTests } from '../../helpers/opencv';
import { tiltHomography, tiltedTargetRgba, type TiltedTargetSpec } from '../../helpers/tilted-target';

const TILTED: TiltedTargetSpec = {
  template: 'precision',
  width: 1200,
  height: 1600,
  cx: 600,
  cy: 820,
  pxPerMm: 4.6,
  tiltDeg: 25,
  distanceMm: 600,
};
const SQUARE_ON: TiltedTargetSpec = { ...TILTED, tiltDeg: 0 };
const SIGHTING_TILTED: TiltedTargetSpec = { ...TILTED, template: 'sighting', pxPerMm: 4.4 };

interface Run {
  spec: TiltedTargetSpec;
  img: RgbaImage;
  truth: Homography;
  base: Homography;
  estimate: PerspectiveEstimate;
}

const runs = new Map<TiltedTargetSpec, Run>();

async function prepare(spec: TiltedTargetSpec): Promise<Run> {
  const cached = runs.get(spec);
  if (cached !== undefined) return cached;
  const cv = await loadOpenCvForTests();
  const img = await tiltedTargetRgba(spec);
  const anchorMm = spec.template === 'sighting' ? SIGHTING_TEMPLATE.anchor.diameterMm : PRECISION_TEMPLATE.anchor.diameterMm;
  const detection = detectAnchor(cv, img, null, anchorMm);
  expect(detection).not.toBeNull();
  const base = homographyFromCalibration(detection!.calibration);
  const estimate = estimatePerspective(img, base, spec.template);
  expect(estimate).not.toBeNull();
  const run: Run = { spec, img, truth: tiltHomography(spec), base, estimate: estimate! };
  runs.set(spec, run);
  return run;
}

/** Distance from the model's target centre to the sheet's printed centre, in mm. */
function centreErrorMm(model: Homography, truth: Homography): number {
  const mm = pxToMmH(mmToPxH({ xMm: 0, yMm: 0 }, model), truth);
  return Math.hypot(mm.xMm, mm.yMm);
}

beforeAll(async () => {
  await Promise.all([prepare(TILTED), prepare(SQUARE_ON), prepare(SIGHTING_TILTED)]);
}, 60_000);

describe('a precision sheet tilted 25 degrees', () => {
  it('the ellipse model misses the printed centre by more than a millimetre', async () => {
    const run = await prepare(TILTED);
    const error = centreErrorMm(run.estimate.ellipse, run.truth);
    expect(error).toBeGreaterThan(1);
  });

  it('the projective model recovers the printed centre within 0.5 mm', async () => {
    const run = await prepare(TILTED);
    expect(centreErrorMm(run.estimate.projective, run.truth)).toBeLessThan(0.5);
  });

  it('puts the 10 ring on the printed 10 ring, an order of magnitude better than the ellipse', async () => {
    const run = await prepare(TILTED);
    const tenMm = PRECISION_TEMPLATE.ringDiameterMm[10];
    const ellipse = circleErrorMm(run.estimate, tenMm, run.estimate.ellipse);
    const projective = circleErrorMm(run.estimate, tenMm, run.estimate.projective);
    expect(ellipse).not.toBeNull();
    expect(projective).not.toBeNull();
    expect(projective!.meanMm).toBeLessThan(0.2);
    expect(projective!.meanMm).toBeLessThan(ellipse!.meanMm / 5);
  });

  it('does not buy the centre at the outer rings expense (M18 Pitfalls)', async () => {
    const run = await prepare(TILTED);
    const ellipse = circleErrorMm(run.estimate, PRECISION_TEMPLATE.blackDiameterMm, run.estimate.ellipse);
    const projective = circleErrorMm(run.estimate, PRECISION_TEMPLATE.blackDiameterMm, run.estimate.projective);
    expect(projective!.meanMm).toBeLessThanOrEqual(ellipse!.meanMm);
    expect(projective!.meanMm).toBeLessThan(0.2);
  });

  it('the per-circle ellipse centres step along a line (M18 step 1)', async () => {
    const run = await prepare(TILTED);
    const { centre } = run.estimate;
    expect(centre.centresMm.length).toBeGreaterThanOrEqual(10);
    expect(centre.spreadMm).toBeGreaterThan(1);
    // Collinear, and the step grows with the square of the radius. Scatter would show neither.
    expect(centre.offLineMm).toBeLessThan(centre.spreadMm / 20);
    expect(Math.abs(centre.r2Correlation)).toBeGreaterThan(0.95);
  });
});

describe('a precision sheet photographed square on', () => {
  it('the two models agree within 0.2 mm (no regression on square-on photos)', async () => {
    const run = await prepare(SQUARE_ON);
    expect(centreOffsetMm(run.estimate.ellipse, run.estimate.projective)).toBeLessThan(0.2);
    for (const p of [
      { xMm: 0, yMm: 0 },
      { xMm: 5.2, yMm: 0 },
      { xMm: -45, yMm: 28 },
    ]) {
      const a = mmToPxH(p, run.estimate.ellipse);
      const b = mmToPxH(p, run.estimate.projective);
      expect(Math.hypot(a.x - b.x, a.y - b.y) / run.spec.pxPerMm).toBeLessThan(0.2);
    }
  });

  it('the per-circle centres scatter instead of stepping', async () => {
    const run = await prepare(SQUARE_ON);
    expect(run.estimate.centre.spreadMm).toBeLessThan(0.2);
  });
});

describe('a sighting sheet tilted 25 degrees', () => {
  it('recovers the printed centre within 0.5 mm from five circles', async () => {
    const run = await prepare(SIGHTING_TILTED);
    expect(run.estimate.usedCircles).toBeGreaterThanOrEqual(4);
    expect(centreErrorMm(run.estimate.projective, run.truth)).toBeLessThan(0.5);
    expect(centreErrorMm(run.estimate.ellipse, run.truth)).toBeGreaterThan(
      centreErrorMm(run.estimate.projective, run.truth),
    );
  });
});

describe('printedCircles', () => {
  it('lists the sighting sheet circles M18 step 1 names, with how each one appears', () => {
    expect(printedCircles('sighting')).toEqual([
      { diameterMm: 15, kind: 'light-line' },
      { diameterMm: 40, kind: 'light-line' },
      { diameterMm: 45, kind: 'light-line' },
      { diameterMm: 110, kind: 'light-line' },
      { diameterMm: 115, kind: 'step' },
    ]);
  });

  it('lists every precision ring, with the mark boundary as a step', () => {
    const circles = printedCircles('precision');
    expect(circles.map((c) => c.diameterMm)).toEqual([5, 10.4, 26.4, 42.4, 58.4, 74.4, 90.4, 106.4, 112.4, 122.4, 138.4, 154.4]);
    expect(circles.find((c) => c.diameterMm === 112.4)?.kind).toBe('step');
    expect(circles.find((c) => c.diameterMm === 10.4)?.kind).toBe('light-line');
    expect(circles.find((c) => c.diameterMm === 154.4)?.kind).toBe('dark-line');
  });
});

describe('measureRingEdges', () => {
  it('finds nearly every ray on a clean synthetic sheet', async () => {
    const run = await prepare(TILTED);
    const circles = measureRingEdges(run.img, run.estimate.projective, 'precision');
    for (const circle of circles) expect(circle.support).toBeGreaterThan(0.8);
  });

  it('returns no estimate when the image holds no target at all', () => {
    const blank: RgbaImage = {
      data: new Uint8ClampedArray(200 * 200 * 4).fill(240),
      width: 200,
      height: 200,
    };
    // A model centred on the blank paper, at a scale that puts every ring inside it.
    const model = homographyFromCalibration({
      cx: 100,
      cy: 100,
      radiusPx: 56.2,
      axisRatio: 1,
      angleDeg: 0,
      anchorDiameterMm: PRECISION_TEMPLATE.anchor.diameterMm,
    });
    expect(estimatePerspective(blank, model, 'precision')).toBeNull();
  });
});
