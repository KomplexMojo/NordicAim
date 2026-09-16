// M10 step 3 / analysis-pipeline §2 (A4). Finds the dark anchor disc (the sighting sheet's disc, the
// precision sheet's black aiming mark) and turns its fitted ellipse into a `Calibration` in the pixel
// space of the image it was given. Pure over `RgbaImage`; no DOM.

import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';
import type { RgbaImage } from '@/lib/media/format';
import type { AnchorDetection } from '@/lib/pipeline/alignment';

import { toGrayMat } from './gray';
import type { CvMat, OpenCv } from './opencv';
import { hintTemplate } from './template-hint';

/** geometry-scoring §1.2 / §1.3: the anchor diameter each template's disc represents. */
export const ANCHOR_DIAMETER_MM: Record<TemplateId, number> = { sighting: 115, precision: 112.4 };

/** Detection runs on a downscaled gray image (PLAN R5: "<= 1200 px detection"). */
export const DETECTION_MAX_LONGEST = 1200;

const MIN_AREA_FRACTION = 0.01; // M10 step 3.2: contours >= 1% of the image area
const MIN_CONTOUR_POINTS = 5; // fitEllipse needs at least 5 points
const MIN_FILL = 0.85;
const MIN_AXIS_RATIO = 0.6;
const GATE_CENTRE_FRACTION = 0.25; // M10 step 3.3
const GATE_RADIUS_MIN = 0.75;
const GATE_RADIUS_MAX = 1.33;
const KERNEL_RADIUS_FRACTION = 0.08;
const MIN_KERNEL = 9;

interface Candidate {
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

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** M10 steps 3.1-3.2: binarize, close, take external contours, keep ellipse-like ones. */
function findCandidates(cv: OpenCv, gray: CvMat, guessR: number): Candidate[] {
  const blurred = new cv.Mat();
  const binary = new cv.Mat();
  const closed = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let kernel: CvMat | null = null;

  try {
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    const k = Math.max(MIN_KERNEL, Math.round(guessR * KERNEL_RADIUS_FRACTION));
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k));
    cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, kernel);

    cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = MIN_AREA_FRACTION * (gray.cols as number) * (gray.rows as number);
    const candidates: Candidate[] = [];

    for (let i = 0; i < (contours.size() as number); i += 1) {
      const contour = contours.get(i);
      try {
        const area = cv.contourArea(contour) as number;
        if (area < minArea) continue;
        if ((contour.rows as number) < MIN_CONTOUR_POINTS) continue;

        const rect = cv.fitEllipse(contour);
        const a = Math.max(rect.size.width, rect.size.height) / 2;
        const b = Math.min(rect.size.width, rect.size.height) / 2;
        if (a <= 0 || b <= 0) continue;

        const fill = area / (Math.PI * a * b);
        const axisRatio = b / a;
        if (fill < MIN_FILL || axisRatio < MIN_AXIS_RATIO) continue;

        candidates.push({
          cx: rect.center.x,
          cy: rect.center.y,
          a,
          b,
          angleDeg: openCvAngleToSpec(rect.angle, rect.size.width, rect.size.height),
          fill,
          area,
        });
      } finally {
        contour.delete();
      }
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

function bestBy(candidates: Candidate[], score: (c: Candidate) => number): Candidate | null {
  let best: Candidate | null = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const value = score(candidate);
    if (value > bestScore) {
      bestScore = value;
      best = candidate;
    }
  }
  return best;
}

/**
 * M10 step 3. `prior` is in the same pixel space as `img` (Stage A scales it first). Pass the anchor
 * diameter in mm, or `'both'` for an import with no template, which resolves it from `hintTemplate`.
 *
 * REV-25: the prior only ranks candidates. When nothing sits inside its gate the best measured disc is
 * still returned, flagged `outsidePrior: true`; null means no candidate passed the quality filter.
 */
export function detectAnchor(
  cv: OpenCv,
  img: RgbaImage,
  prior: Calibration | null,
  anchorDiameterMm: number | 'both',
): AnchorDetection | null {
  const { mat: gray, scale } = toGrayMat(cv, img, DETECTION_MAX_LONGEST);
  let best: Candidate | null;
  let outsidePrior = false;

  try {
    const priorPx =
      prior === null ? null : { cx: prior.cx * scale, cy: prior.cy * scale, r: prior.radiusPx * scale };
    // M10 step 3.1 sizes the CLOSE kernel from `guessR`, which is the prior's radius. An import has no
    // prior, so it falls back to the formula's floor: measured on the reference JPEGs (M10 Completion
    // notes), a larger kernel only merges the aiming mark into the printed rings around it.
    const guessR = priorPx?.r ?? 0;

    const candidates = findCandidates(cv, gray, guessR);
    if (candidates.length === 0) return null;

    if (priorPx === null) {
      best = bestBy(candidates, (c) => c.fill * c.area);
    } else {
      const gated = candidates.filter((c) => {
        const dist = Math.hypot(c.cx - priorPx.cx, c.cy - priorPx.cy);
        const ratio = c.a / priorPx.r;
        return dist <= GATE_CENTRE_FRACTION * priorPx.r && ratio >= GATE_RADIUS_MIN && ratio <= GATE_RADIUS_MAX;
      });
      if (gated.length > 0) {
        best = bestBy(gated, (c) => {
          const dist = Math.hypot(c.cx - priorPx.cx, c.cy - priorPx.cy);
          return c.fill * (1 - dist / priorPx.r);
        });
      } else {
        best = bestBy(candidates, (c) => c.fill * c.area);
        outsidePrior = best !== null;
      }
    }
  } finally {
    gray.delete();
  }

  if (best === null) return null;

  // M10 step 3.4: back to the pixel space of `img`.
  const cx = best.cx / scale;
  const cy = best.cy / scale;
  const radiusPx = best.a / scale;
  const axisRatio = clamp(best.b / best.a, MIN_AXIS_RATIO, 1);
  const confidence = clamp(best.fill, 0, 1);

  // M10 step 3.5: an import with no template gets its anchor diameter from the template hint.
  const diameterMm =
    anchorDiameterMm === 'both'
      ? ANCHOR_DIAMETER_MM[
          hintTemplate(cv, img, {
            cx,
            cy,
            radiusPx,
            axisRatio,
            angleDeg: best.angleDeg,
            anchorDiameterMm: ANCHOR_DIAMETER_MM.precision,
          }).template
        ]
      : anchorDiameterMm;

  const calibration: Calibration = {
    cx,
    cy,
    radiusPx,
    axisRatio,
    angleDeg: best.angleDeg,
    anchorDiameterMm: diameterMm,
    source: 'auto',
    confidence,
  };

  return { calibration, confidence, outsidePrior };
}
