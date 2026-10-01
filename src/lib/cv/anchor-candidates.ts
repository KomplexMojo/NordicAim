// M10 step 3 / analysis-pipeline §2 (A4), REV-25, REV-26: finding the dark anchor disc's candidate ellipses (thresholds, contours,
// the nested search) and their size score. Split out of `anchor.ts` (issue #24); pure over OpenCV Mats; no DOM.

import type { CvMat, OpenCv } from './opencv';

const MIN_AREA_FRACTION = 0.01; // M10 step 3.2: contours >= 1% of the image area
const MIN_CONTOUR_POINTS = 5; // fitEllipse needs at least 5 points
const MIN_FILL = 0.85;
export const MIN_AXIS_RATIO = 0.6;
export const GATE_CENTRE_FRACTION = 0.25; // M10 step 3.3
export const GATE_RADIUS_MIN = 0.75;
export const GATE_RADIUS_MAX = 1.33;
const KERNEL_RADIUS_FRACTION = 0.08;
const MIN_KERNEL = 9;
/**
 * Solidity weight in the no-prior score (M10 step 3.3 states `fill * area`). REV-26's nested search
 * can pool several concentric shapes at once — the aiming mark plus the printed ring lines *around* it,
 * which pass the guard precisely because their interior is mostly the mark — and plain `fill * area`
 * then prefers the largest, i.e. a ring rather than the mark. Measured over the bridged fixture and both
 * reference photos, squaring `fill` is the smallest change that is correct on every case:
 *
 * | pool | `fill * area` | `fill^2 * area` | `fill^8 * area` | max fill |
 * |---|---|---|---|---|
 * | bridged fixture (disc 0.998 vs ring 0.877) | ring, +7.40% | **disc, +0.17%** | disc | disc |
 * | `IMG_5132` (5 candidates, 0.895-0.920) | mark, +0.07% | **mark, +0.07%** | +6.27% | +20.78% |
 *
 * A pool with one candidate is unaffected: any monotone score picks it.
 */
const FILL_EXPONENT = 2;

/** M10 step 3.3, no-prior score: solidity-weighted area (see {@link FILL_EXPONENT}). */
export function sizeScore(candidate: Candidate): number {
  return candidate.fill ** FILL_EXPONENT * candidate.area;
}

export interface Candidate {
  cx: number;
  cy: number;
  /** Semi-major and semi-minor axes, in detection px. */
  a: number;
  b: number;
  angleDeg: number;
  fill: number;
  area: number;
}

/**
 * OpenCV's `fitEllipse` returns a `RotatedRect` whose angle is the rotation of its **width** side,
 * clockwise from image +x. The spec wants the **major** axis, in [0, 180).
 */
export function openCvAngleToSpec(rectAngleDeg: number, sizeWidth: number, sizeHeight: number): number {
  const major = sizeHeight >= sizeWidth ? rectAngleDeg + 90 : rectAngleDeg;
  return ((major % 180) + 180) % 180;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * REV-26 rule 1: `fill` is the fraction of filled pixels inside the fitted ellipse measured on the
 * **pre-CLOSE** binary. The contour's own area is useless here (an outer boundary always scores ~1.0,
 * ring gaps included), and the post-CLOSE fraction is kernel-dependent: a merged blob measures 0.69 at
 * kernel 9 but 0.99 at kernel 30, which is the kernel a capture prior produces.
 *
 * Only the ellipse's bounding box is rasterised, so this stays cheap enough for the phone (§9).
 */
function ellipseFill(cv: OpenCv, binary: CvMat, rect: OpenCv): number {
  const cols = binary.cols as number;
  const rows = binary.rows as number;
  const half = Math.ceil(Math.max(rect.size.width, rect.size.height) / 2) + 2;
  const x0 = Math.max(0, Math.floor(rect.center.x) - half);
  const y0 = Math.max(0, Math.floor(rect.center.y) - half);
  const x1 = Math.min(cols, Math.ceil(rect.center.x) + half);
  const y1 = Math.min(rows, Math.ceil(rect.center.y) + half);
  if (x1 <= x0 || y1 <= y0) return 0;

  const mask = cv.Mat.zeros(y1 - y0, x1 - x0, cv.CV_8UC1);
  const and = new cv.Mat();
  let view: CvMat | null = null;
  try {
    cv.ellipse(
      mask,
      new cv.Point(Math.round(rect.center.x) - x0, Math.round(rect.center.y) - y0),
      new cv.Size(Math.max(1, Math.round(rect.size.width / 2)), Math.max(1, Math.round(rect.size.height / 2))),
      rect.angle,
      0,
      360,
      new cv.Scalar(255, 255, 255, 255),
      -1,
      cv.LINE_8,
      0,
    );
    const total = cv.countNonZero(mask) as number;
    if (total === 0) return 0;

    view = binary.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0));
    cv.bitwise_and(view, mask, and);
    return (cv.countNonZero(and) as number) / total;
  } finally {
    mask.delete();
    and.delete();
    view?.delete();
  }
}

/**
 * M10 step 3.2: one contour -> a quality-checked candidate, or null when it is too small, too few
 * points, not elliptical enough, or its pre-CLOSE fill is below the guard.
 */
function evaluateContour(cv: OpenCv, contour: CvMat, binary: CvMat, minArea: number): Candidate | null {
  const area = cv.contourArea(contour) as number;
  if (area < minArea) return null;
  if ((contour.rows as number) < MIN_CONTOUR_POINTS) return null;

  const rect = cv.fitEllipse(contour);
  const a = Math.max(rect.size.width, rect.size.height) / 2;
  const b = Math.min(rect.size.width, rect.size.height) / 2;
  if (a <= 0 || b <= 0) return null;
  if (b / a < MIN_AXIS_RATIO) return null;

  const fill = ellipseFill(cv, binary, rect);
  if (fill < MIN_FILL) return null;

  return {
    cx: rect.center.x,
    cy: rect.center.y,
    a,
    b,
    angleDeg: openCvAngleToSpec(rect.angle, rect.size.width, rect.size.height),
    fill,
    area,
  };
}

/** True when `inner`'s centre lies inside the rejected candidate's fitted ellipse and is smaller. */
function isInside(inner: { cx: number; cy: number; a: number }, outer: Candidate): boolean {
  if (inner.a >= outer.a) return false;
  const theta = (outer.angleDeg * Math.PI) / 180;
  const dx = inner.cx - outer.cx;
  const dy = inner.cy - outer.cy;
  const u = dx * Math.cos(theta) + dy * Math.sin(theta);
  const v = -dx * Math.sin(theta) + dy * Math.cos(theta);
  return (u / outer.a) ** 2 + (v / outer.b) ** 2 <= 1;
}

/**
 * REV-26 rule 2 (nested search). The disc a merged blob swallowed is only recoverable on the
 * **pre-CLOSE** binary: the CLOSE is what welds the printed rings to the aiming mark, so after it the
 * disc's boundary is not a contour at all (on `IMG_5132-precision.jpg` the blob has one crescent child
 * at kernel 9 and no children at kernel 30). Pre-CLOSE, the sheet's concentric shapes are separate
 * components — `RETR_CCOMP` lists a component sitting inside another's hole at the top level — so the
 * search tests every pre-CLOSE contour that falls geometrically inside the rejected candidate, plus the
 * rejected candidate's own hierarchy children.
 */
function nestedCandidates(cv: OpenCv, binary: CvMat, rejected: Candidate[], minArea: number): Candidate[] {
  if (rejected.length === 0) return [];

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
    const found: Candidate[] = [];
    for (let i = 0; i < (contours.size() as number); i += 1) {
      const contour = contours.get(i);
      try {
        const candidate = evaluateContour(cv, contour, binary, minArea);
        if (candidate === null) continue;
        if (rejected.some((outer) => isInside(candidate, outer))) found.push(candidate);
      } finally {
        contour.delete();
      }
    }
    return found;
  } finally {
    contours.delete();
    hierarchy.delete();
  }
}

/** M10 steps 3.1-3.2 and 3.2a: binarize, close, take CCOMP contours, keep the ellipse-like ones. */
export function findCandidates(cv: OpenCv, gray: CvMat, guessR: number): Candidate[] {
  const blurred = new cv.Mat();
  const binary = new cv.Mat();
  const closed = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let kernel: CvMat | null = null;

  try {
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    // The pre-CLOSE binary is kept: REV-26 measures every candidate's fill on it.
    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    const k = Math.max(MIN_KERNEL, Math.round(guessR * KERNEL_RADIUS_FRACTION));
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k));
    cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, kernel);

    // RETR_CCOMP so each outer contour's children are available (M10 step 3.1).
    cv.findContours(closed, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
    const parentOf = hierarchy.data32S as Int32Array;

    const minArea = MIN_AREA_FRACTION * (gray.cols as number) * (gray.rows as number);
    const candidates: Candidate[] = [];
    const rejected: Candidate[] = [];

    for (let i = 0; i < (contours.size() as number); i += 1) {
      const contour = contours.get(i);
      let outerRect: OpenCv | null = null;
      try {
        // Top level only; children are reached through the rejected parent below.
        if ((parentOf[i * 4 + 3] as number) !== -1) continue;

        const candidate = evaluateContour(cv, contour, binary, minArea);
        if (candidate !== null) {
          candidates.push(candidate);
          continue;
        }

        // Rejected: remember its fitted ellipse so the nested search knows what "inside" means, and
        // test its own children (M10 step 3.2a).
        const area = cv.contourArea(contour) as number;
        if (area < minArea || (contour.rows as number) < MIN_CONTOUR_POINTS) continue;
        outerRect = cv.fitEllipse(contour);
        const a = Math.max(outerRect.size.width, outerRect.size.height) / 2;
        const b = Math.min(outerRect.size.width, outerRect.size.height) / 2;
        if (a <= 0 || b <= 0) continue;
        rejected.push({
          cx: outerRect.center.x,
          cy: outerRect.center.y,
          a,
          b,
          angleDeg: openCvAngleToSpec(outerRect.angle, outerRect.size.width, outerRect.size.height),
          fill: 0,
          area,
        });

        for (let child = parentOf[i * 4 + 2] as number; child !== -1; child = parentOf[child * 4] as number) {
          const childContour = contours.get(child);
          try {
            const childCandidate = evaluateContour(cv, childContour, binary, minArea);
            if (childCandidate !== null) candidates.push(childCandidate);
          } finally {
            childContour.delete();
          }
        }
      } finally {
        contour.delete();
      }
    }

    // Only pay for the pre-CLOSE pass when an outer candidate actually failed the guard.
    if (candidates.length === 0 || rejected.length > 0) {
      candidates.push(...nestedCandidates(cv, binary, rejected, minArea));
    }
    return candidates;
  } finally {
    blurred.delete();
    binary.delete();
    closed.delete();
    contours.delete();
    hierarchy.delete();
    kernel?.delete();
  }
}
