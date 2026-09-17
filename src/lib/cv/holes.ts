// analysis-pipeline §2 (A5) / M11 / M16 rework (REV-34 to REV-37). Finds bullet holes in a working
// image and returns them as `auto` shots in target mm. Pure over `RgbaImage`; no DOM.
//
//   R3  search the paper sheet the target is printed on (sheet.ts), never the backing board
//   R2  printed circles are erased by position; numerals are dropped by position (print-mask.ts)
//   R1  a hole is where a hole-sized disc deviates from its background either way (hole-signal.ts)
//       M11's area gate and REV-27's stroke/elongation filter, then per-surface acceptance
//   REV-28  every automatic shot is ONE hole (multiplicity 1); capping is Stage A/B's job

import type { Shot } from '@/lib/domain/analysis';
import type { TemplateId } from '@/lib/domain/enums';
import type { CalibrationLike } from '@/lib/geometry/transform';
import type { RgbaImage } from '@/lib/media/format';

import {
  DETECTION_PX_PER_MM,
  ELONGATION_MAX,
  HOLE_MARK_SCORE_MIN,
  HOLE_PAPER_CONTRAST_MIN,
  HOLE_PAPER_ELONGATION_MAX,
  HOLE_PAPER_SURROUND_MAX,
  NUMERAL_KEEP_SCORE,
  SHEET_SEARCH_CAP_MM,
  STROKE_MIN_FRACTION,
} from './constants';
import { measureCandidate, type CandidateFeatures } from './hole-features';
import { holeSignal, SURFACE_MARK } from './hole-signal';
import type { OpenCv as OpenCvHandle } from './opencv';
import {
  estimateNumeralRotation,
  inNumeralBox,
  printedBandMap,
  type NumeralRotation,
} from './print-mask';
import { rectify, rectifiedToMm } from './rectify';
import { findSheet, type SheetMethod } from './sheet';

export { printedCircleRadiiMm, RING_MASK_HALF_WIDTH_MM } from './print-mask';

/** M11 step 5: a component smaller than this fraction of one hole is noise. */
export const MIN_AREA_FRACTION = 0.35;
/** M11 step 5: a component this many holes large is a merged or torn cluster. */
export const CLUSTER_AREA_RATIO = 1.6;
/** M11 step 5: a cluster's centroid is only an approximation, so its confidence is discounted. */
export const CLUSTER_CONFIDENCE_FACTOR = 0.6;
/** REV-28: every automatic shot is ONE hole. */
export const AUTO_MULTIPLICITY = 1;

export type RejectionReason = 'area' | 'glyph' | 'mark-score' | 'paper' | 'numeral' | 'outside-sheet';

export interface ShotCandidate {
  xMm: number;
  yMm: number;
  radialMm: number;
  surface: 'mark' | 'paper';
  /** R1: the share of the hole disc that deviates, 0-1. */
  score: number;
  areaMm2: number;
  elongation: number;
  strokeRadiusMm: number;
  coreContrast: number;
  surround: number;
  cluster: boolean;
  confidence: number;
  multiplicity: number;
}

export interface RejectedCandidate extends ShotCandidate {
  reason: RejectionReason;
}

export interface DetectionReport {
  candidates: ShotCandidate[];
  rejected: RejectedCandidate[];
  /** R3: how the search area was found. `fallback` must be reported (see M16 Open questions). */
  sheet: { method: SheetMethod; seedCoverage: number; paperGray: number };
  /** R2: the numeral rotation, precision sheets only. */
  numeralRotation: NumeralRotation | null;
  pxPerMm: number;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** M11 step 2: the area of one clean hole in px at `pxPerMm`. */
export function holeAreaPx(holeDiameterMm: number, pxPerMm: number): number {
  return Math.PI * (holeDiameterMm / 2) ** 2 * pxPerMm ** 2;
}

/** REV-27: a thin stroke or a long remnant is print, not a hole. */
export function isPrintedGlyph(
  blob: Pick<CandidateFeatures, 'elongation' | 'strokeRadiusPx'>,
  holeDiameterMm: number,
  pxPerMm: number,
): boolean {
  return blob.elongation > ELONGATION_MAX || blob.strokeRadiusPx < STROKE_MIN_FRACTION * (holeDiameterMm / 2) * pxPerMm;
}

/** Why a measured candidate is not a hole, or null when it is one. Order: M11 gate, REV-27, surface, R2. */
function rejection(
  candidate: ShotCandidate,
  features: CandidateFeatures,
  a1: number,
  holeDiameterMm: number,
  pxPerMm: number,
  rotation: NumeralRotation | null,
): RejectionReason | null {
  if (features.blobAreaPx < MIN_AREA_FRACTION * a1) return 'area';
  if (isPrintedGlyph(features, holeDiameterMm, pxPerMm)) return 'glyph';
  if (candidate.surface === 'mark') {
    if (candidate.score < HOLE_MARK_SCORE_MIN) return 'mark-score';
  } else if (
    Math.abs(features.coreContrast) < HOLE_PAPER_CONTRAST_MIN ||
    features.surround > HOLE_PAPER_SURROUND_MAX ||
    features.elongation > HOLE_PAPER_ELONGATION_MAX
  ) {
    return 'paper';
  }
  if (
    rotation !== null &&
    rotation.reliable &&
    inNumeralBox(candidate.xMm, candidate.yMm, rotation.deg) &&
    (candidate.surface === 'paper' || candidate.score < NUMERAL_KEEP_SCORE)
  ) {
    return 'numeral';
  }
  return null;
}

/**
 * A5 with everything it decided, so `pnpm cv:eval` can report what was kept and why the rest went.
 * `calibration` is in the pixel space of `img`.
 */
export function detectShotCandidates(
  cv: OpenCvHandle,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
  holeDiameterMm: number,
): DetectionReport {
  const pxPerMm = DETECTION_PX_PER_MM;
  const rect = rectify(cv, img, calibration, template, { pxPerMm, radiusMm: SHEET_SEARCH_CAP_MM, chroma: true });
  try {
    const { side } = rect;
    const n = side * side;
    const gray = rect.gray.data as Uint8Array;
    const anchorRadiusMm = calibration.anchorDiameterMm / 2;

    const sheet = findSheet(cv, rect, template);
    const bands = printedBandMap(side, pxPerMm, template, anchorRadiusMm);
    const searchable = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) if (sheet.mask[i] === 1 && bands[i] !== 1) searchable[i] = 1;

    const signal = holeSignal(cv, rect, searchable, anchorRadiusMm, holeDiameterMm);
    const rotation = template === 'precision' ? estimateNumeralRotation({ gray, side, pxPerMm }) : null;

    const distance = new Float32Array(n);
    const deviatesMat = new cv.Mat(side, side, cv.CV_8UC1);
    const distanceMat = new cv.Mat();
    try {
      const d = deviatesMat.data as Uint8Array;
      for (let i = 0; i < n; i += 1) d[i] = signal.deviates[i] === 1 ? 255 : 0;
      cv.distanceTransform(deviatesMat, distanceMat, cv.DIST_L2, 3);
      distance.set(distanceMat.data32F as Float32Array);
    } finally {
      deviatesMat.delete();
      distanceMat.delete();
    }

    const holeRadiusPx = (holeDiameterMm / 2) * pxPerMm;
    const a1 = holeAreaPx(holeDiameterMm, pxPerMm);
    const candidates: ShotCandidate[] = [];
    const rejected: RejectedCandidate[] = [];
    for (const peak of signal.peaks) {
      const features = measureCandidate(gray, side, signal, distance, peak, holeRadiusPx);
      const { xMm, yMm } = rectifiedToMm(peak, rect);
      const cluster = features.blobAreaPx / a1 >= CLUSTER_AREA_RATIO;
      const score = clamp(peak.share, 0, 1);
      const candidate: ShotCandidate = {
        xMm,
        yMm,
        radialMm: Math.hypot(xMm, yMm),
        surface: signal.surface[peak.y * side + peak.x] === SURFACE_MARK ? 'mark' : 'paper',
        score,
        areaMm2: features.blobAreaPx / pxPerMm ** 2,
        elongation: features.elongation,
        strokeRadiusMm: features.strokeRadiusPx / pxPerMm,
        coreContrast: features.coreContrast,
        surround: features.surround,
        cluster,
        confidence: score * (cluster ? CLUSTER_CONFIDENCE_FACTOR : 1),
        multiplicity: AUTO_MULTIPLICITY,
      };
      // R3 / REV-33: assert the sheet bound rather than assume it.
      const reason =
        sheet.mask[peak.y * side + peak.x] !== 1
          ? 'outside-sheet'
          : rejection(candidate, features, a1, holeDiameterMm, pxPerMm, rotation);
      if (reason === null) candidates.push(candidate);
      else rejected.push({ ...candidate, reason });
    }

    candidates.sort((a, b) => a.radialMm - b.radialMm || a.xMm - b.xMm || a.yMm - b.yMm);
    return {
      candidates,
      rejected,
      sheet: { method: sheet.method, seedCoverage: sheet.seedCoverage, paperGray: sheet.paperGray },
      numeralRotation: rotation,
      pxPerMm,
    };
  } finally {
    rect.gray.delete();
    rect.valid.delete();
    rect.chroma?.delete();
  }
}

/**
 * analysis-pipeline §2 (A5). The bullet holes in a working image as `auto` shots in mm
 * (geometry-scoring §2: origin at the target centre, +x right, +y up). Ids are `auto-1 …` in
 * ascending radial order. Every shot has `multiplicity` 1 (REV-28); capping to the declared rounds is
 * Stage A's and Stage B's job (`capShots`).
 */
export function detectShots(
  cv: OpenCvHandle,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
  holeDiameterMm: number,
): Shot[] {
  const report = detectShotCandidates(cv, img, calibration, template, holeDiameterMm);
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
