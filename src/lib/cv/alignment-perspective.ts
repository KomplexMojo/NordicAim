// M18 steps 1-2. Puts the two halves together for one photo: measure every printed circle
// (`ring-edges.ts`), then fit both models to the SAME measured points — the ellipse the app stores
// today and the projective mapping M18 proposes — so the comparison is like for like.
//
// Step 1's statistic is `centre`: the per-circle ellipse centres, and whether they STEP ALONG A LINE
// (perspective) or SCATTER (a plain fitting error). Under perspective the image of a circle of radius
// r has its ellipse centre displaced from the true centre by about `r^2 sin(tilt) cos(tilt) / distance`
// millimetres — along one direction, growing with r^2 — so `offLineMm` stays small while `spreadMm`
// and `r2Correlation` grow.
//
// Pure over `RgbaImage`: no DOM, no OpenCV, no clock, no randomness.

import type { TemplateId } from '@/lib/domain/enums';
import { fitCircleHomography, radialErrorsMm, type CirclePoint } from '@/lib/geometry/fit-homography';
import { centrePx, invertHomography, pxToMmH, type Homography } from '@/lib/geometry/homography';
import type { RgbaImage } from '@/lib/media/format';

import { measureRingEdges, type RingEdgeCircle, type RingEdgeOptions } from './ring-edges';

/** A homography needs several circles; from one it is under-determined (M18 Pitfalls). */
export const MIN_CIRCLES = 3;

export interface CentreSpread {
  /** Per-circle ellipse centres, in mm in the base model's target frame. */
  centresMm: Array<{ rMm: number; xMm: number; yMm: number }>;
  /** Largest distance between any two of those centres, in mm. */
  spreadMm: number;
  /** RMS distance of the centres from their own best-fit line, in mm. Small = they step, not scatter. */
  offLineMm: number;
  /** Direction of that line, in degrees counter-clockwise from target +x. */
  directionDeg: number;
  /**
   * Pearson correlation between `r^2` and the signed displacement along the line. Perspective predicts
   * about +1 (or -1, depending on which end the line is measured from); a fitting error predicts ~0.
   */
  r2Correlation: number;
}

export interface PerspectiveEstimate {
  circles: RingEdgeCircle[];
  /** Circles that contributed points to the fits. */
  usedCircles: number;
  points: number;
  /** The ellipse model, refitted to the measured points (the app's model today). */
  ellipse: Homography;
  ellipseRmsMm: number;
  /** The projective model M18 proposes. */
  projective: Homography;
  projectiveRmsMm: number;
  centre: CentreSpread;
}

function fitLine(points: Array<{ xMm: number; yMm: number }>): {
  offLineMm: number;
  directionDeg: number;
  projections: number[];
} {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.xMm, 0) / n;
  const my = points.reduce((s, p) => s + p.yMm, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.xMm - mx) ** 2;
    syy += (p.yMm - my) ** 2;
    sxy += (p.xMm - mx) * (p.yMm - my);
  }
  // Principal direction of the 2x2 covariance, in closed form.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const projections = points.map((p) => (p.xMm - mx) * ux + (p.yMm - my) * uy);
  const perpendicular = points.map((p) => -(p.xMm - mx) * uy + (p.yMm - my) * ux);
  const offLineMm = Math.sqrt(perpendicular.reduce((s, v) => s + v * v, 0) / n);
  return { offLineMm, directionDeg: (theta * 180) / Math.PI, projections };
}

function correlation(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const x = (a[i] as number) - ma;
    const y = (b[i] as number) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da <= 1e-18 || db <= 1e-18) return 0;
  return num / Math.sqrt(da * db);
}

/** M18 step 1: are the per-circle centres stepping along a line, or scattering? */
export function centreSpread(circles: readonly RingEdgeCircle[], base: Homography): CentreSpread {
  const inverse = invertHomography(base);
  const centresMm = circles
    .filter((c): c is RingEdgeCircle & { ellipseCentrePx: { x: number; y: number } } => c.ellipseCentrePx !== null)
    .map((c) => ({ rMm: c.rMm, ...pxToMmH(c.ellipseCentrePx, base, inverse) }));

  if (centresMm.length < 2) {
    return { centresMm, spreadMm: 0, offLineMm: 0, directionDeg: 0, r2Correlation: 0 };
  }
  let spreadMm = 0;
  for (let i = 0; i < centresMm.length; i += 1) {
    for (let j = i + 1; j < centresMm.length; j += 1) {
      const a = centresMm[i] as { xMm: number; yMm: number };
      const b = centresMm[j] as { xMm: number; yMm: number };
      spreadMm = Math.max(spreadMm, Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm));
    }
  }
  const line = fitLine(centresMm);
  return {
    centresMm,
    spreadMm,
    offLineMm: line.offLineMm,
    directionDeg: line.directionDeg,
    r2Correlation: correlation(
      centresMm.map((c) => c.rMm ** 2),
      line.projections,
    ),
  };
}

/**
 * M18 steps 1-2 for one photo. `base` is the model the rays are first walked along — the ellipse
 * calibration `detectAnchor` produced. Returns null when fewer than {@link MIN_CIRCLES} printed
 * circles could be measured, which is the honest answer rather than a homography from too little.
 *
 * The measurement runs twice: once along `base`, then again along the fitted projective model, so the
 * search windows are centred on the printed circles rather than on the ellipse model's guess at them.
 */
export function estimatePerspective(
  img: RgbaImage,
  base: Homography,
  template: TemplateId,
  options: RingEdgeOptions = {},
): PerspectiveEstimate | null {
  const first = measureRingEdges(img, base, template, options);
  if (first.filter((c) => c.points.length > 0).length < MIN_CIRCLES) return null;
  const firstPoints = first.flatMap((c) => c.points);
  const firstFit = fitCircleHomography(firstPoints, base);

  const circles = measureRingEdges(img, firstFit.homography, template, options);
  const used = circles.filter((c) => c.points.length > 0);
  if (used.length < MIN_CIRCLES) return null;
  const points: CirclePoint[] = used.flatMap((c) => c.points);

  const ellipse = fitCircleHomography(points, base, { affineOnly: true });
  const projective = fitCircleHomography(points, ellipse.homography);

  return {
    circles,
    usedCircles: used.length,
    points: points.length,
    ellipse: ellipse.homography,
    ellipseRmsMm: ellipse.rmsMm,
    projective: projective.homography,
    projectiveRmsMm: projective.rmsMm,
    centre: centreSpread(circles, ellipse.homography),
  };
}

/**
 * M18 step 3 / Pitfalls: how far a model puts one printed circle from where it was measured, in mm —
 * reported at the centre (the 10 ring or the inner circle) AND at the anchor edge, so a better centre
 * that spoiled the outer rings could not hide.
 */
export function circleErrorMm(
  estimate: PerspectiveEstimate,
  diameterMm: number,
  model: Homography,
): { meanMm: number; maxMm: number; points: number } | null {
  const circle = estimate.circles.find((c) => c.diameterMm === diameterMm);
  if (circle === undefined || circle.points.length === 0) return null;
  const errors = radialErrorsMm(circle.points, model).map(Math.abs);
  return {
    meanMm: errors.reduce((s, v) => s + v, 0) / errors.length,
    maxMm: Math.max(...errors),
    points: errors.length,
  };
}

/**
 * How far apart two models put the target centre, in mm. `b`'s centre is read in `a`'s target frame,
 * where `a`'s own centre is the origin by definition.
 */
export function centreOffsetMm(a: Homography, b: Homography): number {
  const mm = pxToMmH(centrePx(b), a, invertHomography(a));
  return Math.hypot(mm.xMm, mm.yMm);
}
