// M18 Tests. The whole path on a rendered sheet: find the anchor the way the pipeline does, measure
// every printed circle, then fit both models to those points.
//
// `tests/helpers/tilted-target.ts` draws the sheet under a KNOWN homography, so the printed centre is
// exact — unlike `synthetic-target.ts`, which draws every circle with the ellipse model and therefore
// cannot pose the question at all.

import { beforeAll, describe, expect, it } from 'vitest';

import { detectAnchor } from '@/lib/cv/anchor';
import {
  calibrationWithPerspective,
  centreOffsetMm,
  circleErrorMm,
  estimatePerspective,
  type PerspectiveEstimate,
} from '@/lib/cv/alignment-perspective';
import { mmToRectified, rectifiedToMm, rectify } from '@/lib/cv/rectify';
import { measureRingEdges, printedCircles } from '@/lib/cv/ring-edges';
import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '@/lib/defaults/templates';
import type { Calibration } from '@/lib/domain/photo';
import { homographyFromCalibration, mmToPxH, pxToMmH, type Homography } from '@/lib/geometry/homography';
import { mmToPx, pxToMm } from '@/lib/geometry/transform';
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

// REV-44: what Stage A stores. `calibrationWithPerspective` turns the fit into data-model §3's seven
// numbers, and everything downstream reads them through `mmToPx` — so the tests below go through it.
describe('calibrationWithPerspective (the stored calibration)', () => {
  async function detected(spec: TiltedTargetSpec): Promise<{ img: RgbaImage; cal: Calibration }> {
    const cv = await loadOpenCvForTests();
    const run = await prepare(spec);
    const anchorMm = spec.template === 'sighting' ? SIGHTING_TEMPLATE.anchor.diameterMm : PRECISION_TEMPLATE.anchor.diameterMm;
    const detection = detectAnchor(cv, run.img, null, anchorMm);
    return { img: run.img, cal: detection!.calibration };
  }

  /** Distance from where a calibration puts the target centre to the printed centre, in mm. */
  function storedCentreErrorMm(cal: Calibration, truth: Homography): number {
    const mm = pxToMmH(mmToPx({ xMm: 0, yMm: 0 }, cal), truth);
    return Math.hypot(mm.xMm, mm.yMm);
  }

  it('recovers the printed centre of a sheet tilted 25 degrees within 0.5 mm; the ellipse does not', async () => {
    const { img, cal } = await detected(TILTED);
    const refined = calibrationWithPerspective(img, cal, 'precision');
    expect(refined).not.toBeNull();
    expect(refined!.perspective).not.toBeNull();
    expect(refined!.source).toBe(cal.source);
    expect(refined!.confidence).toBe(cal.confidence);
    const truth = tiltHomography(TILTED);
    expect(storedCentreErrorMm(cal, truth)).toBeGreaterThan(0.5);
    expect(storedCentreErrorMm(refined!, truth)).toBeLessThan(0.5);
  });

  it('puts every printed ring within 0.3 mm through mmToPx (centre and anchor edge alike)', async () => {
    const { img, cal } = await detected(TILTED);
    const refined = calibrationWithPerspective(img, cal, 'precision')!;
    const truth = tiltHomography(TILTED);
    for (const diameterMm of [PRECISION_TEMPLATE.ringDiameterMm[10], PRECISION_TEMPLATE.blackDiameterMm]) {
      const r = diameterMm / 2;
      for (let k = 0; k < 24; k += 1) {
        const t = (k * Math.PI) / 12;
        const printed = mmToPxH({ xMm: r * Math.cos(t), yMm: r * Math.sin(t) }, truth);
        const mm = pxToMmH(printed, homographyFromCalibration(refined));
        expect(Math.abs(Math.hypot(mm.xMm, mm.yMm) - r)).toBeLessThan(0.3);
      }
    }
  });

  it('a square-on sheet: the stored calibration agrees with the ellipse within 0.2 mm', async () => {
    const { img, cal } = await detected(SQUARE_ON);
    const refined = calibrationWithPerspective(img, cal, 'precision')!;
    expect(refined).not.toBeNull();
    for (const p of [
      { xMm: 0, yMm: 0 },
      { xMm: 5.2, yMm: 0 },
      { xMm: -45, yMm: 28 },
    ]) {
      const a = mmToPx(p, cal);
      const b = mmToPx(p, refined);
      expect(Math.hypot(a.x - b.x, a.y - b.y) / SQUARE_ON.pxPerMm).toBeLessThan(0.2);
    }
  });

  it('returns null on a blank image, so Stage A keeps perspective null', () => {
    const blank: RgbaImage = { data: new Uint8ClampedArray(200 * 200 * 4).fill(240), width: 200, height: 200 };
    const cal: Calibration = {
      cx: 100,
      cy: 100,
      radiusPx: 56.2,
      axisRatio: 1,
      angleDeg: 0,
      anchorDiameterMm: PRECISION_TEMPLATE.anchor.diameterMm,
      source: 'auto',
      confidence: 0.9,
      perspective: null,
    };
    expect(calibrationWithPerspective(blank, cal, 'precision')).toBeNull();
  });

  it('rectify warps with the perspective: a dot lands where pxToMm and the sheet put it', async () => {
    const cv = await loadOpenCvForTests();
    const { img, cal } = await detected(TILTED);
    const refined = calibrationWithPerspective(img, cal, 'precision')!;
    // A bright 7x7 dot on the black mark at r = 41.2 mm, midway between the printed 5 and 6 rings (which
    // are light lines there too); its true mm position comes from the sheet's own geometry, at the dot's
    // actual (whole-pixel) centre.
    const truth = tiltHomography(TILTED);
    const near = mmToPxH({ xMm: 29.13, yMm: 29.13 }, truth);
    const dot = { x: Math.round(near.x), y: Math.round(near.y) };
    const dotMm = pxToMmH(dot, truth);
    const data = new Uint8ClampedArray(img.data);
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        const i = ((dot.y + dy) * img.width + dot.x + dx) * 4;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }

    /** The dot's centroid after rectifying with `c`, read back in target mm. */
    function rectifiedDotMm(c: Calibration): { xMm: number; yMm: number } {
      const rect = rectify(cv, { ...img, data }, c, 'precision', { pxPerMm: 10, radiusMm: 60 });
      try {
        const gray = rect.gray.data as Uint8Array;
        const geom = { side: rect.side, pxPerMm: rect.pxPerMm };
        const expected = mmToRectified(pxToMm(dot, c), geom);
        const reach = 2 * rect.pxPerMm;
        let sum = 0;
        let sx = 0;
        let sy = 0;
        for (let y = Math.floor(expected.y - reach); y <= expected.y + reach; y += 1) {
          for (let x = Math.floor(expected.x - reach); x <= expected.x + reach; x += 1) {
            const v = gray[y * rect.side + x] as number;
            if (v < 128) continue;
            sum += v;
            sx += v * x;
            sy += v * y;
          }
        }
        expect(sum).toBeGreaterThan(0);
        return rectifiedToMm({ x: sx / sum, y: sy / sum }, geom);
      } finally {
        rect.gray.delete();
        rect.valid.delete();
        rect.chroma?.delete();
        rect.rgb?.delete();
      }
    }

    // Rectify and pxToMm agree: the warp is the calibration's own E · P, not a 3-point affine of it.
    const projective = rectifiedDotMm(refined);
    const own = pxToMm(dot, refined);
    expect(Math.hypot(projective.xMm - own.xMm, projective.yMm - own.yMm)).toBeLessThan(0.1);
    // And against the sheet: the dot's distance from the printed centre (the frame's in-plane rotation is
    // unobservable from concentric circles, so the radius is what can be compared).
    const trueR = Math.hypot(dotMm.xMm, dotMm.yMm);
    const projectiveR = Math.hypot(projective.xMm, projective.yMm);
    const affine = rectifiedDotMm({ ...refined, perspective: null });
    const affineR = Math.hypot(affine.xMm, affine.yMm);
    expect(Math.abs(projectiveR - trueR)).toBeLessThan(0.3);
    expect(Math.abs(projectiveR - trueR)).toBeLessThan(Math.abs(affineR - trueR));
  });
});
