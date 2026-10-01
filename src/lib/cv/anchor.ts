// M10 step 3 / analysis-pipeline §2 (A4), §3 (REV-25, REV-26). Finds the dark anchor disc (the sighting
// sheet's disc, the precision sheet's black aiming mark) and turns its fitted ellipse into a
// `Calibration` in the pixel space of the image it was given. Pure over `RgbaImage`; no DOM.

import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';
import type { RgbaImage } from '@/lib/media/format';
import type { AnchorDetection } from '@/lib/pipeline/alignment';

import { toGrayMat } from './gray';
import type { OpenCv } from './opencv';
import { hintTemplate } from './template-hint';

import {
  type Candidate,
  GATE_CENTRE_FRACTION,
  GATE_RADIUS_MAX,
  GATE_RADIUS_MIN,
  MIN_AXIS_RATIO,
  clamp,
  findCandidates,
  sizeScore,
} from './anchor-candidates';

export { openCvAngleToSpec } from './anchor-candidates';

/** geometry-scoring §1.2 / §1.3: the anchor diameter each template's disc represents. */
export const ANCHOR_DIAMETER_MM: Record<TemplateId, number> = { sighting: 115, precision: 112.4 };

/** Detection runs on a downscaled gray image (PLAN R5: "<= 1200 px detection"). */
export const DETECTION_MAX_LONGEST = 1200;

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
      best = bestBy(candidates, sizeScore);
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
        best = bestBy(candidates, sizeScore);
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
    perspective: null,
  };

  return { calibration, confidence, outsidePrior };
}
