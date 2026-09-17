// M11 steps 2-5 / M16 (REV-27, REV-28, REV-32, REV-33) / analysis-pipeline §2 (A5). Segments bullet
// holes out of the rectified target and turns every surviving connected component into a `Shot` in
// mm. Pure over `RgbaImage`; no DOM.
//
// Three rules from the owner's 2026-09-16 review shape what is accepted:
//   REV-27  a printed ring numeral is a thin stroke, not a hole: reject it by shape.
//   REV-28  always assume ONE hole; the app never invents rounds the owner did not fire.
//   REV-33  nothing outside the rectified crop is ever a candidate (the backing board is not the sheet).

import type { Shot } from '@/lib/domain/analysis';
import type { TemplateId } from '@/lib/domain/enums';
import type { CalibrationLike } from '@/lib/geometry/transform';
import type { RgbaImage } from '@/lib/media/format';

import { measureComponents, type ComponentMetrics } from './component-metrics';
import { DEFAULT_DETECTION_METHOD, ELONGATION_MAX, STROKE_MIN_FRACTION } from './constants';
import { buildRegions, globalHoleMask, searchRadiusMm } from './hole-mask';
import { scanRegions, type RegionTuning, type TileStats } from './holes-region';
import type { OpenCv as OpenCvHandle } from './opencv';
import { CANONICAL_PX_PER_MM, rectify, rectifiedToMm, type Rectified } from './rectify';

export {
  DISC_DELTA,
  DISC_INSET_MM,
  PAPER_DELTA,
  PAPER_OUTSET_MM,
  RING_MASK_HALF_WIDTH_MM,
  printedCircleRadiiMm,
  searchRadiusMm,
} from './hole-mask';

/** M11 step 5: a component smaller than this fraction of one hole is noise. */
export const MIN_AREA_FRACTION = 0.35;
/** M11 step 5: a component this many holes large is a merged or torn cluster. */
export const CLUSTER_AREA_RATIO = 1.6;
/** M11 step 5: a component less round than this is a cluster whatever its area says. */
export const CLUSTER_CIRCULARITY = 0.65;
/** M11 step 5: a cluster's centroid is only an approximation, so its confidence is discounted. */
export const CLUSTER_CONFIDENCE_FACTOR = 0.6;
/**
 * REV-28: every automatic shot is ONE hole. `cluster` is still measured, and still flags the shot and
 * discounts its confidence, but it no longer multiplies the rounds: overlapping holes stay one shot
 * until the owner says otherwise in Adjust.
 */
export const AUTO_MULTIPLICITY = 1;

export type DetectionMethod = 'global' | 'region';

export interface DetectShotsOptions {
  /** Which segmentation to run. Defaults to {@link DEFAULT_DETECTION_METHOD}. */
  method?: DetectionMethod;
  /** Region-scan tuning overrides, for `cv:eval`'s measurement sweep only. */
  tuning?: RegionTuning;
}

/** One measured component that survived, or nearly survived, the gates — the unit `cv:eval` reports. */
export interface ShotCandidate {
  xMm: number;
  yMm: number;
  radialMm: number;
  areaPx: number;
  areaMm2: number;
  circularity: number;
  /** REV-27: major / minor of the fitted ellipse. */
  elongation: number;
  /** REV-27: the maximum inscribed radius, in mm. */
  strokeRadiusMm: number;
  fill: number;
  cluster: boolean;
  confidence: number;
  multiplicity: number;
}

export type RejectionReason = 'glyph' | 'outside-crop';

export interface RejectedCandidate extends ShotCandidate {
  reason: RejectionReason;
}

export interface DetectionReport {
  method: DetectionMethod;
  candidates: ShotCandidate[];
  rejected: RejectedCandidate[];
  /** Region-scan bookkeeping; null for the global method. */
  tiles: TileStats | null;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** M11 step 2: the area of one clean hole in rectified px (the milestone's `· 64` is 8 px/mm squared). */
export function holeAreaPx(holeDiameterMm: number): number {
  return Math.PI * (holeDiameterMm / 2) ** 2 * CANONICAL_PX_PER_MM ** 2;
}

/**
 * REV-27's shape filter. A bullet hole is a compact blob: its fitted ellipse is not far off round and
 * a disc of nearly the hole's own radius fits inside it. A printed numeral is a thin stroke, so it
 * fails one or both tests however large its blob is.
 */
export function isPrintedGlyph(
  component: Pick<ComponentMetrics, 'elongation' | 'strokeRadiusPx'>,
  holeDiameterMm: number,
  pxPerMm: number,
): boolean {
  const minStrokePx = STROKE_MIN_FRACTION * (holeDiameterMm / 2) * pxPerMm;
  return component.elongation > ELONGATION_MAX || component.strokeRadiusPx < minStrokePx;
}

/** M11 step 5 / REV-28: one measured component -> one candidate shot, always of multiplicity 1. */
function toCandidate(component: ComponentMetrics, rect: Rectified, a1: number): ShotCandidate {
  const { xMm, yMm } = rectifiedToMm({ x: component.x, y: component.y }, rect);
  const k = component.areaPx / a1;
  const cluster = k >= CLUSTER_AREA_RATIO || component.circularity < CLUSTER_CIRCULARITY;
  return {
    xMm,
    yMm,
    radialMm: Math.hypot(xMm, yMm),
    areaPx: component.areaPx,
    areaMm2: component.areaPx / rect.pxPerMm ** 2,
    circularity: component.circularity,
    elongation: component.elongation,
    strokeRadiusMm: component.strokeRadiusPx / rect.pxPerMm,
    fill: component.fill,
    cluster,
    confidence: clamp(component.circularity, 0, 1) * (cluster ? CLUSTER_CONFIDENCE_FACTOR : 1),
    multiplicity: AUTO_MULTIPLICITY,
  };
}

/**
 * M11 steps 1-5 with M16's gates. Returns everything the gates decided, so `pnpm cv:eval` can report
 * what was kept, what was rejected as a printed glyph, and what fell outside the crop.
 */
export function detectShotCandidates(
  cv: OpenCvHandle,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
  holeDiameterMm: number,
  options: DetectShotsOptions = {},
): DetectionReport {
  const method = options.method ?? DEFAULT_DETECTION_METHOD;
  const rect = rectify(cv, img, calibration, template);
  try {
    const maps = buildRegions(rect, calibration, template);
    const a1 = holeAreaPx(holeDiameterMm);
    const minAreaPx = MIN_AREA_FRACTION * a1;
    const accept = (component: ComponentMetrics): boolean =>
      !isPrintedGlyph(component, holeDiameterMm, rect.pxPerMm);

    let kept: ComponentMetrics[];
    let glyphs: ComponentMetrics[];
    let tiles: TileStats | null = null;

    if (method === 'region') {
      const scan = scanRegions(cv, rect, maps, {
        minAreaPx,
        dedupeRadiusPx: (holeDiameterMm / 2) * rect.pxPerMm,
        accept,
        tuning: options.tuning,
      });
      kept = scan.components;
      glyphs = scan.rejected;
      tiles = scan.tiles;
    } else {
      const mask = globalHoleMask(cv, rect, maps);
      try {
        const components = measureComponents(cv, mask, minAreaPx);
        kept = components.filter(accept);
        glyphs = components.filter((component) => !accept(component));
      } finally {
        mask.delete();
      }
    }

    // REV-33: assert the crop bound rather than assume it. `buildRegions` already refuses to look
    // outside the search area, so this can only fire if that ever changes — which is the point.
    const limitMm = searchRadiusMm(template);
    const candidates: ShotCandidate[] = [];
    const rejected: RejectedCandidate[] = glyphs.map((component) => ({
      ...toCandidate(component, rect, a1),
      reason: 'glyph' as const,
    }));
    for (const component of kept) {
      const candidate = toCandidate(component, rect, a1);
      if (candidate.radialMm > limitMm) {
        rejected.push({ ...candidate, reason: 'outside-crop' });
        continue;
      }
      candidates.push(candidate);
    }

    candidates.sort((a, b) => a.radialMm - b.radialMm || a.xMm - b.xMm || a.yMm - b.yMm);
    return { method, candidates, rejected, tiles };
  } finally {
    rect.gray.delete();
    rect.valid.delete();
  }
}

/**
 * M11 steps 1-5 / analysis-pipeline §2 (A5). Detects the bullet holes in a working image and returns
 * them as `auto` shots in mm (geometry-scoring §2: origin at the target centre, +x right, +y up).
 *
 * `calibration` is in the pixel space of `img`. Ids are `auto-1 …` in ascending radial order, which
 * keeps them stable for a given image; the milestone does not fix an order (see M11's Open questions).
 * Every shot has `multiplicity` 1 (REV-28); capping to the declared rounds is Stage A's and Stage B's
 * job (`capShots`), because detection does not know how many rounds were fired.
 */
export function detectShots(
  cv: OpenCvHandle,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
  holeDiameterMm: number,
  options: DetectShotsOptions = {},
): Shot[] {
  const report = detectShotCandidates(cv, img, calibration, template, holeDiameterMm, options);
  return report.candidates.map((candidate, index) => ({
    id: `auto-${index + 1}`,
    xMm: candidate.xMm,
    yMm: candidate.yMm,
    multiplicity: candidate.multiplicity,
    positionOverrides: null,
    source: 'auto' as const,
    confidence: candidate.confidence,
    cluster: candidate.cluster,
  }));
}
