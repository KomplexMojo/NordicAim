// M18 step 1. Measures where the sheet's printed circles REALLY are in the photo, so the alignment
// question stops being a matter of opinion: for each printed circle of known radius, walk outwards
// along many rays from the model's centre, find the printed line (or the black mark's edge) on each
// ray to sub-pixel accuracy, and keep the point.
//
// Fitting an ellipse to ONE circle's points gives that circle's own centre. Under perspective those
// centres step along a line towards the nearer side of the sheet, with the step growing as the square
// of the radius; under a plain fitting error they scatter. That is the hypothesis M18 step 1 tests.
//
// Pure over `RgbaImage` (AGENTS.md pure/adapter split): no DOM, no canvas, and no OpenCV — every
// operation here is a profile along a ray plus the least-squares fit in `geometry/fit-homography.ts`.

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '@/lib/defaults/templates';
import type { TemplateId } from '@/lib/domain/enums';
import { fitCircleHomography, radialErrorsMm, type CirclePoint } from '@/lib/geometry/fit-homography';
import { affinePartAtCentre, centrePx, mmToPxH, pxToMmH, type Homography } from '@/lib/geometry/homography';
import type { RgbaImage } from '@/lib/media/format';

/** How the printed circle appears in the photo, which decides what to look for along a ray. */
export type RingEdgeKind = 'step' | 'light-line' | 'dark-line';

export interface RingEdgeOptions {
  /** Rays per circle, evenly spaced in target space. */
  samples?: number;
  /** Half-width of the radial search window, in mm, before the neighbouring-circle cap. */
  windowMm?: number;
  /** Radial sampling step along a ray, in mm. */
  stepMm?: number;
  /** Least gray-level contrast a sample must show to be believed. */
  minContrast?: number;
}

export interface RingEdgeCircle {
  diameterMm: number;
  rMm: number;
  kind: RingEdgeKind;
  /** The measured edge points, in image px, tagged with the printed radius they belong to. */
  points: CirclePoint[];
  /** Fraction of the rays that produced a believable point (a dashed guide can only reach ~0.5). */
  support: number;
  /** Centre of the ellipse fitted to this circle alone, in px — null when there are too few points. */
  ellipseCentrePx: { x: number; y: number } | null;
  /** RMS radial residual of that single-circle ellipse fit, in mm. */
  ellipseRmsMm: number | null;
}

const DEFAULT_SAMPLES = 180;
const DEFAULT_WINDOW_MM = 3;
const DEFAULT_STEP_MM = 0.1;
const DEFAULT_MIN_CONTRAST = 6;
/** A window never reaches more than this fraction of the way to the neighbouring printed circle. */
const NEIGHBOUR_FRACTION = 0.45;
/** Outlier rejection on a circle's points: drop beyond this many robust sigmas, then refit once. */
const OUTLIER_SIGMAS = 2.5;
const MIN_POINTS = 12;

/**
 * The printed circles this measurement uses, with the diameter each one is printed at
 * (geometry-scoring §1.2, §1.3). M18 step 1: "precision: the ring lines; sighting: the 115 mm disc,
 * 110 and 40 mm guides, 45 mm circle and inner circle."
 */
export function printedCircles(template: TemplateId): Array<{ diameterMm: number; kind: RingEdgeKind }> {
  const anchorMm =
    template === 'sighting' ? SIGHTING_TEMPLATE.anchor.diameterMm : PRECISION_TEMPLATE.anchor.diameterMm;
  const diameters =
    template === 'sighting'
      ? [
          SIGHTING_TEMPLATE.anchor.diameterMm,
          SIGHTING_TEMPLATE.zones.standing.guideDiameterMm,
          SIGHTING_TEMPLATE.zones.prone.solidDiameterMm,
          SIGHTING_TEMPLATE.zones.prone.guideDiameterMm,
          ...SIGHTING_TEMPLATE.unscoredCircles.map((circle) => circle.diameterMm),
        ]
      : [
          PRECISION_TEMPLATE.blackDiameterMm,
          PRECISION_TEMPLATE.innerTenDiameterMm,
          ...Object.values(PRECISION_TEMPLATE.ringDiameterMm),
        ];
  return [...new Set(diameters)]
    .sort((a, b) => a - b)
    .map((diameterMm) => ({
      diameterMm,
      // The mark's own boundary is a step from black to paper; a ring line inside the mark is printed
      // white on black, and one outside it is dark on paper.
      kind: diameterMm === anchorMm ? 'step' : diameterMm < anchorMm ? 'light-line' : 'dark-line',
    }));
}

/** Rec. 709 luma, matching `src/lib/media/image-stats.ts`. */
function lumaAt(img: RgbaImage, x: number, y: number): number | null {
  if (!(x >= 0 && y >= 0 && x <= img.width - 1 && y <= img.height - 1)) return null;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, img.width - 1);
  const y1 = Math.min(y0 + 1, img.height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (px: number, py: number): number => {
    const i = (py * img.width + px) * 4;
    return 0.2126 * (img.data[i] ?? 0) + 0.7152 * (img.data[i + 1] ?? 0) + 0.0722 * (img.data[i + 2] ?? 0);
  };
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Sub-pixel position of the extremum, by a parabola through the three samples around index `i`. */
function refine(values: number[], i: number): number {
  const a = values[i - 1] as number;
  const b = values[i] as number;
  const c = values[i + 1] as number;
  const denom = a - 2 * b + c;
  if (Math.abs(denom) < 1e-12) return i;
  return i + Math.max(-1, Math.min(1, (0.5 * (a - c)) / denom));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length === 0) return 0;
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** One ray: the radius in mm at which the printed feature sits, or null when nothing believable. */
function findEdgeRadiusMm(
  img: RgbaImage,
  h: Homography,
  angle: number,
  rMm: number,
  windowMm: number,
  kind: RingEdgeKind,
  stepMm: number,
  minContrast: number,
): number | null {
  const count = Math.max(5, Math.round((2 * windowMm) / stepMm) + 1);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const profile: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = rMm - windowMm + (i * (2 * windowMm)) / (count - 1);
    const p = mmToPxH({ xMm: r * cos, yMm: r * sin }, h);
    const value = lumaAt(img, p.x, p.y);
    if (value === null) return null;
    profile.push(value);
  }

  if (kind === 'step') {
    // The mark's boundary: the steepest gradient in the window, measured centrally.
    const gradient = profile.map((_, i) =>
      i === 0 || i === count - 1 ? 0 : Math.abs((profile[i + 1] as number) - (profile[i - 1] as number)),
    );
    let best = 1;
    for (let i = 1; i < count - 1; i += 1) if ((gradient[i] as number) > (gradient[best] as number)) best = i;
    if (best <= 1 || best >= count - 2) return null;
    if ((gradient[best] as number) < minContrast) return null;
    const index = refine(gradient, best);
    return rMm - windowMm + (index * (2 * windowMm)) / (count - 1);
  }

  // A printed line: an extremum against the local surface either side of it.
  const wantMax = kind === 'light-line';
  let best = 1;
  for (let i = 1; i < count - 1; i += 1) {
    const better = wantMax ? (profile[i] as number) > (profile[best] as number) : (profile[i] as number) < (profile[best] as number);
    if (better) best = i;
  }
  if (best <= 1 || best >= count - 2) return null;
  const baseline = median(profile);
  if (Math.abs((profile[best] as number) - baseline) < minContrast) return null;
  const index = refine(
    wantMax ? profile : profile.map((v) => -v),
    best,
  );
  return rMm - windowMm + (index * (2 * windowMm)) / (count - 1);
}

/**
 * M18 step 1. Every printed circle's measured edge points, plus the ellipse fitted to each circle on
 * its own. `h` is the model the rays are walked along — the ellipse calibration to begin with, and the
 * refined homography on a second pass.
 */
export function measureRingEdges(
  img: RgbaImage,
  h: Homography,
  template: TemplateId,
  options: RingEdgeOptions = {},
): RingEdgeCircle[] {
  const samples = options.samples ?? DEFAULT_SAMPLES;
  const baseWindow = options.windowMm ?? DEFAULT_WINDOW_MM;
  const stepMm = options.stepMm ?? DEFAULT_STEP_MM;
  const minContrast = options.minContrast ?? DEFAULT_MIN_CONTRAST;

  const circles = printedCircles(template);
  const radii = circles.map((c) => c.diameterMm / 2);
  // Every per-circle fit is an ELLIPSE fit, so it starts from an affine model even when the rays are
  // walked along a projective one (`affinePartAtCentre`).
  const affine = affinePartAtCentre(h);

  return circles.map((circle, index) => {
    const rMm = radii[index] as number;
    // Never search more than part of the way to the neighbouring printed circle: on the precision
    // sheet the inner circle and ring 10 are 2.7 mm apart, and ring 3 is 3 mm inside the mark's edge.
    const gaps = radii.filter((_, i) => i !== index).map((other) => Math.abs(other - rMm));
    const nearest = gaps.length === 0 ? Infinity : Math.min(...gaps);
    const windowMm = Math.max(0.4, Math.min(baseWindow, NEIGHBOUR_FRACTION * nearest, NEIGHBOUR_FRACTION * rMm));

    const points: CirclePoint[] = [];
    for (let i = 0; i < samples; i += 1) {
      const angle = (2 * Math.PI * i) / samples;
      const found = findEdgeRadiusMm(img, h, angle, rMm, windowMm, circle.kind, stepMm, minContrast);
      if (found === null) continue;
      const p = mmToPxH({ xMm: found * Math.cos(angle), yMm: found * Math.sin(angle) }, h);
      points.push({ x: p.x, y: p.y, rMm });
    }

    const kept = trimOutliers(points, affine);
    let ellipseCentrePx: { x: number; y: number } | null = null;
    let ellipseRmsMm: number | null = null;
    if (kept.length >= MIN_POINTS) {
      const fit = fitCircleHomography(kept, affine, { affineOnly: true });
      const candidate = centrePx(fit.homography);
      // An arc of points that barely curves can fit an enormous ellipse whose centre is nowhere near
      // the sheet. A printed circle's own centre can never be further from the model's centre than
      // its own radius, so anything beyond that is a degenerate fit, not a measurement.
      const offsetMm = pxToMmH(candidate, h);
      if (Math.hypot(offsetMm.xMm, offsetMm.yMm) <= rMm) {
        ellipseCentrePx = candidate;
        ellipseRmsMm = fit.rmsMm;
      }
    }

    return {
      diameterMm: circle.diameterMm,
      rMm,
      kind: circle.kind,
      points: kept,
      support: samples === 0 ? 0 : kept.length / samples,
      ellipseCentrePx,
      ellipseRmsMm,
    };
  });
}

/** Drops points whose radial residual against a first ellipse fit is a robust outlier. */
function trimOutliers(points: CirclePoint[], h: Homography): CirclePoint[] {
  if (points.length < MIN_POINTS) return points;
  const fit = fitCircleHomography(points, h, { affineOnly: true });
  const residuals = radialErrorsMm(points, fit.homography);
  const mid = median(residuals);
  const mad = median(residuals.map((r) => Math.abs(r - mid)));
  const sigma = 1.4826 * mad;
  if (sigma <= 1e-9) return points;
  const limit = OUTLIER_SIGMAS * sigma;
  const kept = points.filter((_, i) => Math.abs((residuals[i] as number) - mid) <= limit);
  return kept.length >= MIN_POINTS ? kept : points;
}
