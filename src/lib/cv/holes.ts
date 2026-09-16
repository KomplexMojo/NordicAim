// M11 steps 2-5 / analysis-pipeline §2 (A5). Segments bullet holes out of the rectified target and
// turns every connected component into a `Shot` in mm, with a multiplicity for merged or torn
// clusters. Pure over `RgbaImage`; no DOM.
//
// Both thresholds are relative to a LOCAL median, never to a fixed gray level: the same sheet
// photographed in daylight and under a head torch has wildly different absolute levels, but a hole
// is always much brighter than the ink around it and much darker than the paper around it.

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '@/lib/defaults/templates';
import type { Shot } from '@/lib/domain/analysis';
import type { TemplateId } from '@/lib/domain/enums';
import type { CalibrationLike } from '@/lib/geometry/transform';
import type { RgbaImage } from '@/lib/media/format';

import type { CvMat, OpenCv } from './opencv';
import { CANONICAL_PX_PER_MM, outerRadiusMm, rectify, rectifiedToMm, type Rectified } from './rectify';

/** M11 step 3: inside the disc a hole is at least this much brighter than the ink around it. */
export const DISC_DELTA = 45;
/** M11 step 3: outside the disc a hole is at least this much darker than the paper around it. */
export const PAPER_DELTA = 50;
/** M11 step 3: the disc test stops 1 mm inside the anchor radius, clear of the disc's own edge. */
export const DISC_INSET_MM = 1;
/** M11 step 3: the paper test runs out to the outermost printed circle plus 5 mm. */
export const PAPER_OUTSET_MM = 5;
/** M11 step 4: printed circle lines are erased over this half-width, in mm. */
export const RING_MASK_HALF_WIDTH_MM = 0.9;
/** M11 step 5: a component smaller than this fraction of one hole is noise. */
export const MIN_AREA_FRACTION = 0.35;
/** M11 step 5: a component this many holes large is a merged or torn cluster. */
export const CLUSTER_AREA_RATIO = 1.6;
/** M11 step 5: a component less round than this is a cluster whatever its area says. */
export const CLUSTER_CIRCULARITY = 0.65;
/** M11 step 5: a cluster's centroid is only an approximation, so its confidence is discounted. */
export const CLUSTER_CONFIDENCE_FACTOR = 0.6;
/** M11 step 5: `multiplicity = clamp(round(k), 2, 8)` for a cluster. */
export const MIN_CLUSTER_MULTIPLICITY = 2;
export const MAX_CLUSTER_MULTIPLICITY = 8;

/** M11 step 4: CLOSE then OPEN, both 3x3. */
const MORPH_KERNEL_PX = 3;

// Per-pixel region codes. 0 is "neither test applies" (outside the crop, or off the photo).
const REGION_DISC = 1;
const REGION_PAPER = 2;

/**
 * M11 step 4: "every printed circle radius", in mm, from the sheets' own geometry
 * (geometry-scoring §1.2 and §1.3). Inside the disc these lines are printed WHITE on black and would
 * otherwise segment as one long thin "hole"; outside it they are dark on paper and would do the same
 * against the paper test. The milestone does not enumerate them — see its Open questions.
 */
export function printedCircleRadiiMm(template: TemplateId): number[] {
  const diameters =
    template === 'sighting'
      ? [
          SIGHTING_TEMPLATE.anchor.diameterMm,
          SIGHTING_TEMPLATE.zones.standing.solidDiameterMm,
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
  return [...new Set(diameters.map((d) => d / 2))].sort((a, b) => a - b);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Median of the masked pixels, from a 256-bin histogram (exact for 8-bit, and no 2M-element sort). */
function maskedMedian(gray: Uint8Array, region: Uint8Array, wanted: number): number | null {
  const histogram = new Int32Array(256);
  let count = 0;
  for (let i = 0; i < region.length; i += 1) {
    if (region[i] !== wanted) continue;
    const value = gray[i] as number;
    histogram[value] = (histogram[value] as number) + 1;
    count += 1;
  }
  if (count === 0) return null;

  let cumulative = 0;
  for (let value = 0; value < 256; value += 1) {
    cumulative += histogram[value] as number;
    if (cumulative * 2 >= count) return value;
  }
  return 255;
}

/**
 * M11 steps 3-4, as two per-pixel lookups: which threshold test applies (`region`), and whether the
 * pixel sits on a printed circle line and must be erased (`banded`).
 */
function buildRegions(
  rect: Rectified,
  calibration: CalibrationLike,
  template: TemplateId,
): { region: Uint8Array; banded: Uint8Array } {
  const { side, pxPerMm } = rect;
  const valid = rect.valid.data as Uint8Array;
  const centre = side / 2;

  const anchorRadiusMm = calibration.anchorDiameterMm / 2;
  const discLimitPx = (anchorRadiusMm - DISC_INSET_MM) * pxPerMm;
  const paperLimitPx = (outerRadiusMm(template) + PAPER_OUTSET_MM) * pxPerMm;

  // The anchor circle is a printed circle too, and on a manual calibration it need not be one of the
  // template's own radii, so it is always erased.
  const radiiMm = new Set([...printedCircleRadiiMm(template), anchorRadiusMm]);
  const bands = [...radiiMm].map((radiusMm) => ({
    lo: Math.max(0, (radiusMm - RING_MASK_HALF_WIDTH_MM) * pxPerMm),
    hi: (radiusMm + RING_MASK_HALF_WIDTH_MM) * pxPerMm,
  }));

  // One lookup per pixel instead of one pass over every band: `nearBand[r]` is set when any part of
  // the ring [r, r+1) px could fall inside a band, and only then is the exact test run.
  const nearBand = new Uint8Array(Math.ceil(paperLimitPx) + 2);
  for (let r = 0; r < nearBand.length; r += 1) {
    for (const band of bands) {
      if (r + 1 >= band.lo && r <= band.hi) {
        nearBand[r] = 1;
        break;
      }
    }
  }

  const region = new Uint8Array(side * side);
  const banded = new Uint8Array(side * side);
  for (let y = 0; y < side; y += 1) {
    const dy = y - centre;
    const dy2 = dy * dy;
    const row = y * side;
    for (let x = 0; x < side; x += 1) {
      const i = row + x;
      if (valid[i] === 0) continue;

      const dx = x - centre;
      const radius = Math.sqrt(dx * dx + dy2);
      if (radius <= discLimitPx) region[i] = REGION_DISC;
      else if (radius <= paperLimitPx) region[i] = REGION_PAPER;
      else continue;

      if (nearBand[radius | 0] !== 1) continue;
      for (const band of bands) {
        if (radius >= band.lo && radius <= band.hi) {
          banded[i] = 1;
          break;
        }
      }
    }
  }

  return { region, banded };
}

/** M11 steps 3-4: the hole mask, as a CV_8UC1 Mat the caller owns. */
function segment(
  cv: OpenCv,
  rect: Rectified,
  calibration: CalibrationLike,
  template: TemplateId,
): CvMat {
  const gray = rect.gray.data as Uint8Array;
  const { region, banded } = buildRegions(rect, calibration, template);

  const discMedian = maskedMedian(gray, region, REGION_DISC);
  const paperMedian = maskedMedian(gray, region, REGION_PAPER);
  const discThreshold = discMedian === null ? null : discMedian + DISC_DELTA;
  const paperThreshold = paperMedian === null ? null : paperMedian - PAPER_DELTA;

  const raw = new Uint8Array(rect.side * rect.side);
  for (let i = 0; i < raw.length; i += 1) {
    // Step 4: the printed lines are erased BEFORE the CLOSE, so the CLOSE cannot weld a hole back
    // onto the ring line it sits on.
    if (banded[i] === 1) continue;
    const value = gray[i] as number;
    if (region[i] === REGION_DISC) {
      if (discThreshold !== null && value > discThreshold) raw[i] = 255;
    } else if (region[i] === REGION_PAPER) {
      if (paperThreshold !== null && value < paperThreshold) raw[i] = 255;
    }
  }

  const binary = new cv.Mat(rect.side, rect.side, cv.CV_8UC1);
  (binary.data as Uint8Array).set(raw);

  const closed = new cv.Mat();
  const opened = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(MORPH_KERNEL_PX, MORPH_KERNEL_PX));
  try {
    cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(closed, opened, cv.MORPH_OPEN, kernel);
    return opened;
  } catch (err) {
    opened.delete();
    throw err;
  } finally {
    binary.delete();
    closed.delete();
    kernel.delete();
  }
}

/**
 * Perimeter in px per connected-component label. `connectedComponentsWithStats` gives exact pixel
 * areas and centroids but no perimeter, so the external contours are walked once and each is matched
 * to its label by the label image under the contour's first point.
 */
function perimetersByLabel(cv: OpenCv, mask: CvMat, labels: CvMat, labelCount: number): Float64Array {
  const perimeters = new Float64Array(labelCount);
  const labelData = labels.data32S as Int32Array;
  const side = mask.cols as number;

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    // CHAIN_APPROX_NONE: every boundary pixel, so `arcLength` measures the real outline.
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
    for (let i = 0; i < (contours.size() as number); i += 1) {
      const contour = contours.get(i);
      try {
        const points = contour.data32S as Int32Array;
        const x = points[0];
        const y = points[1];
        if (x === undefined || y === undefined) continue;
        const label = labelData[y * side + x] as number;
        if (label <= 0 || label >= labelCount) continue;
        perimeters[label] = Math.max(perimeters[label] as number, cv.arcLength(contour, true) as number);
      } finally {
        contour.delete();
      }
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }
  return perimeters;
}

interface Candidate {
  xMm: number;
  yMm: number;
  radialMm: number;
  multiplicity: number;
  cluster: boolean;
  confidence: number;
}

/** M11 step 5: components -> shot candidates. */
function candidatesFrom(cv: OpenCv, mask: CvMat, rect: Rectified, holeDiameterMm: number): Candidate[] {
  // Step 2: the area of one clean hole in rectified px (the milestone's `· 64` is 8 px/mm squared).
  const a1 = Math.PI * (holeDiameterMm / 2) ** 2 * CANONICAL_PX_PER_MM ** 2;

  const labels = new cv.Mat();
  const stats = new cv.Mat();
  const centroids = new cv.Mat();
  try {
    const labelCount = cv.connectedComponentsWithStats(mask, labels, stats, centroids) as number;
    const perimeters = perimetersByLabel(cv, mask, labels, labelCount);
    const statsData = stats.data32S as Int32Array;
    const centroidData = centroids.data64F as Float64Array;

    const found: Candidate[] = [];
    // Label 0 is the background.
    for (let label = 1; label < labelCount; label += 1) {
      const areaPx = statsData[label * 5 + (cv.CC_STAT_AREA as number)] as number;
      if (areaPx < MIN_AREA_FRACTION * a1) continue;

      const k = areaPx / a1;
      const perimeterPx = perimeters[label] as number;
      const circularity = perimeterPx > 0 ? (4 * Math.PI * areaPx) / (perimeterPx * perimeterPx) : 0;
      const cluster = k >= CLUSTER_AREA_RATIO || circularity < CLUSTER_CIRCULARITY;
      const multiplicity = cluster
        ? clamp(Math.round(k), MIN_CLUSTER_MULTIPLICITY, MAX_CLUSTER_MULTIPLICITY)
        : 1;

      const { xMm, yMm } = rectifiedToMm(
        { x: centroidData[label * 2] as number, y: centroidData[label * 2 + 1] as number },
        rect,
      );
      found.push({
        xMm,
        yMm,
        radialMm: Math.hypot(xMm, yMm),
        multiplicity,
        cluster,
        confidence: clamp(circularity, 0, 1) * (cluster ? CLUSTER_CONFIDENCE_FACTOR : 1),
      });
    }
    return found;
  } finally {
    labels.delete();
    stats.delete();
    centroids.delete();
  }
}

/**
 * M11 steps 1-5 / analysis-pipeline §2 (A5). Detects the bullet holes in a working image and returns
 * them as `auto` shots in mm (geometry-scoring §2: origin at the target centre, +x right, +y up).
 *
 * `calibration` is in the pixel space of `img`. Ids are `auto-1 …` in ascending radial order, which
 * keeps them stable for a given image; the milestone does not fix an order (see its Open questions).
 */
export function detectShots(
  cv: OpenCv,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
  holeDiameterMm: number,
): Shot[] {
  const rect = rectify(cv, img, calibration, template);
  let mask: CvMat | null = null;
  try {
    mask = segment(cv, rect, calibration, template);
    const found = candidatesFrom(cv, mask, rect, holeDiameterMm);
    found.sort((a, b) => a.radialMm - b.radialMm || a.xMm - b.xMm || a.yMm - b.yMm);

    return found.map((candidate, index) => ({
      id: `auto-${index + 1}`,
      xMm: candidate.xMm,
      yMm: candidate.yMm,
      multiplicity: candidate.multiplicity,
      positionOverrides: null,
      source: 'auto' as const,
      confidence: candidate.confidence,
      cluster: candidate.cluster,
    }));
  } finally {
    mask?.delete();
    rect.gray.delete();
    rect.valid.delete();
  }
}
