// M11 steps 3-4 / M16 (REV-32, REV-33). The per-pixel scaffolding both hole segmentations share:
// which threshold test applies where (the region map), which pixels sit on a printed circle and must
// be erased (the band map), and the global two-threshold mask M11 step 3 specifies.
//
// Both thresholds are relative to a LOCAL median, never to a fixed gray level: the same sheet
// photographed in daylight and under a head torch has wildly different absolute levels, but a hole
// is always much brighter than the ink around it and much darker than the paper around it.

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '@/lib/defaults/templates';
import type { TemplateId } from '@/lib/domain/enums';
import type { CalibrationLike } from '@/lib/geometry/transform';

import type { CvMat, OpenCv } from './opencv';
import { outerRadiusMm, type Rectified } from './rectify';

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
/** M11 step 4: CLOSE then OPEN, both 3x3. */
export const MORPH_KERNEL_PX = 3;

// Per-pixel region codes. 0 is "neither test applies" (outside the crop, or off the photo).
export const REGION_NONE = 0;
export const REGION_DISC = 1;
export const REGION_PAPER = 2;

export interface RegionMaps {
  /** One of {@link REGION_NONE}, {@link REGION_DISC}, {@link REGION_PAPER} per pixel. */
  region: Uint8Array;
  /** 1 where the pixel sits on a printed circle line and must never become a candidate. */
  banded: Uint8Array;
}

/**
 * REV-33: the search area, as a radius in mm from the target centre. Nothing beyond it is ever a
 * candidate — the owner's photos show the backing board, peppered with old holes, right up against
 * the sheet, and a round that landed off the scoring area stays unidentified instead.
 */
export function searchRadiusMm(template: TemplateId): number {
  return outerRadiusMm(template) + PAPER_OUTSET_MM;
}

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

/** Median of the masked pixels, from a 256-bin histogram (exact for 8-bit, and no 2M-element sort). */
export function maskedMedian(gray: Uint8Array, region: Uint8Array, wanted: number): number | null {
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
 * pixel sits on a printed circle line and must be erased (`banded`). REV-33: `region` is also the
 * search area — it is {@link REGION_NONE} everywhere beyond {@link searchRadiusMm}.
 */
export function buildRegions(
  rect: Rectified,
  calibration: CalibrationLike,
  template: TemplateId,
): RegionMaps {
  const { side, pxPerMm } = rect;
  const valid = rect.valid.data as Uint8Array;
  const centre = side / 2;

  const anchorRadiusMm = calibration.anchorDiameterMm / 2;
  const discLimitPx = (anchorRadiusMm - DISC_INSET_MM) * pxPerMm;
  const paperLimitPx = searchRadiusMm(template) * pxPerMm;

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

/** M11 step 4: CLOSE 3x3 then OPEN 3x3 over a raw binary buffer; the caller owns the Mat. */
export function morphMask(cv: OpenCv, raw: Uint8Array, width: number, height: number): CvMat {
  const binary = new cv.Mat(height, width, cv.CV_8UC1);
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
 * M11 step 3 (the "global" method): two thresholds for the whole sheet, each relative to the median
 * of its own region. The hole mask comes back as a CV_8UC1 Mat the caller owns.
 */
export function globalHoleMask(cv: OpenCv, rect: Rectified, maps: RegionMaps): CvMat {
  const gray = rect.gray.data as Uint8Array;
  const { region, banded } = maps;

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

  return morphMask(cv, raw, rect.side, rect.side);
}
