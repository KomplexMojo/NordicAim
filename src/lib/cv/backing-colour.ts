// backing-sheet.md §4, §4a, §5 (REV-38). A coloured sheet behind the target shows through every hole
// and through nothing else, because the target itself is printed in black on white paper. This module
// measures that colour (from a card photo, or from the target photo itself) and finds the holes by it.
// Pure over `RgbaImage` and OpenCV Mats; no DOM, no clock, no randomness.
//
//   §4   `backingColourFromCard` — the circular hue statistics of a photographed card
//   §4   `estimateBackingColour` — the same statistics measured off a target photo, with no card
//   §4a  `detectBackingPresence` — is a coloured backing present in THIS photo? (the `Auto` mode)
//   §5   `detectByBackingColour`  — the holes, as merged coloured blobs in target mm

import type { DetectionRecord } from '@/lib/domain/analysis';
import type { BackingMode, ColourSignature } from '@/lib/domain/backing';
import type { TemplateId } from '@/lib/domain/enums';
import type { CalibrationLike } from '@/lib/geometry/transform';
import type { RgbaImage } from '@/lib/media/format';
import type { CappableShot } from '@/lib/scoring/cap-shots';

import {
  AUTO_MAX_BLOB_RATIO,
  AUTO_MIN_CHROMA,
  AUTO_MIN_SPOTS,
  AUTO_RADIUS_QUANTILE,
  BACKING_HUE_MARGIN_DEG,
  BACKING_MERGE_FRACTION,
  BACKING_MIN_AREA_FRACTION,
  BACKING_OPEN_PX,
  BACKING_OVERLAP_RATIO,
  BACKING_SAT_FLOOR,
  BACKING_SAT_P10_FACTOR,
  CARD_MIN_KEPT_FRACTION,
  CARD_REGION_FRACTION,
  CARD_SAT_MIN,
  CARD_VAL_MIN,
  DETECTION_PX_PER_MM,
  NEUTRAL_CHROMA_MIN,
  NEUTRAL_WHITE_MAX_CHROMA,
  NEUTRAL_WHITE_MIN_MAX,
  SHEET_SEARCH_CAP_MM,
} from './constants';
import { detectShots, holeAreaPx } from './holes';
import type { CvMat, OpenCv } from './opencv';
import { outerRadiusMm, rectify, rectifiedToMm, type Rectified } from './rectify';
import { findSheet, type SheetMethod } from './sheet';

// --- HSV, hue statistics -------------------------------------------------------------------------

export interface Hsv {
  /** 0-360, 0 when the pixel is neutral. */
  hueDeg: number;
  /** 0-1. */
  sat: number;
  /** 0-1. */
  val: number;
}

/** Standard RGB (0-255) -> HSV, with hue in degrees. */
export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const c = max - min;
  let hue = 0;
  if (c !== 0) {
    if (max === r) hue = 60 * (((g - b) / c + 6) % 6);
    else if (max === g) hue = 60 * ((b - r) / c + 2);
    else hue = 60 * ((r - g) / c + 4);
  }
  return { hueDeg: hue, sat: max === 0 ? 0 : c / max, val: max / 255 };
}

/** The signed difference `a - b` wrapped into (-180, 180]. */
export function hueDelta(a: number, b: number): number {
  let d = ((a - b) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/** The absolute circular distance between two hues, 0-180. */
export function hueDistance(a: number, b: number): number {
  return Math.abs(hueDelta(a, b));
}

function normaliseHue(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Nearest-rank quantile of an ascending array (deterministic; no interpolation). */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[index] as number;
}

/**
 * backing-sheet.md §4.4: the circular median hue, and half the circular p10..p90 range as the spread.
 * The median is taken around the mean direction, which is what makes it circular (hues near 0/360 do
 * not average to 180).
 */
export function hueStatistics(hues: number[]): { hueDeg: number; hueSpreadDeg: number } {
  if (hues.length === 0) return { hueDeg: 0, hueSpreadDeg: 0 };
  let sx = 0;
  let sy = 0;
  for (const h of hues) {
    const t = (h * Math.PI) / 180;
    sx += Math.cos(t);
    sy += Math.sin(t);
  }
  const mean = normaliseHue((Math.atan2(sy, sx) * 180) / Math.PI);
  const offsets = hues.map((h) => hueDelta(h, mean)).sort((a, b) => a - b);
  const hueDeg = normaliseHue(mean + quantile(offsets, 0.5));
  const around = hues.map((h) => hueDelta(h, hueDeg)).sort((a, b) => a - b);
  const spread = (quantile(around, 0.9) - quantile(around, 0.1)) / 2;
  return { hueDeg, hueSpreadDeg: Math.max(0, Math.min(90, spread)) };
}

function signatureFrom(hues: number[], sats: number[], vals: number[]): ColourSignature | null {
  if (hues.length === 0) return null;
  const { hueDeg, hueSpreadDeg } = hueStatistics(hues);
  const satSorted = [...sats].sort((a, b) => a - b);
  const valSorted = [...vals].sort((a, b) => a - b);
  return {
    hueDeg,
    hueSpreadDeg,
    satP10: quantile(satSorted, 0.1),
    valP10: quantile(valSorted, 0.1),
    samples: hues.length,
  };
}

// --- §4: the card --------------------------------------------------------------------------------

/**
 * backing-sheet.md §4. The backing's colour measured from a photo of the card: the central 60% x 60%
 * of the frame, keeping pixels that are clearly coloured and not in deep shadow. Returns `null` when
 * fewer than 30% of the region's pixels survive — the card has no clear colour (the UI then shows
 * `CARD_NO_COLOUR_MESSAGE`).
 */
export function backingColourFromCard(img: RgbaImage): ColourSignature | null {
  const x0 = Math.floor((img.width * (1 - CARD_REGION_FRACTION)) / 2);
  const y0 = Math.floor((img.height * (1 - CARD_REGION_FRACTION)) / 2);
  const w = Math.max(1, Math.round(img.width * CARD_REGION_FRACTION));
  const h = Math.max(1, Math.round(img.height * CARD_REGION_FRACTION));
  const x1 = Math.min(img.width, x0 + w);
  const y1 = Math.min(img.height, y0 + h);

  const hues: number[] = [];
  const sats: number[] = [];
  const vals: number[] = [];
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = (y * img.width + x) * 4;
      total += 1;
      const hsv = rgbToHsv(img.data[p] as number, img.data[p + 1] as number, img.data[p + 2] as number);
      if (hsv.sat < CARD_SAT_MIN || hsv.val < CARD_VAL_MIN) continue;
      hues.push(hsv.hueDeg);
      sats.push(hsv.sat);
      vals.push(hsv.val);
    }
  }
  if (total === 0 || hues.length < CARD_MIN_KEPT_FRACTION * total) return null;
  return signatureFrom(hues, sats, vals);
}

// --- the neutral-chroma rule (§4, without a card) ------------------------------------------------

/** The per-channel gains that make the search area's "white" neutral (backing-sheet.md §4.1). */
export function whiteBalanceGains(rgb: Uint8Array, mask: Uint8Array): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] !== 1) continue;
    const r = rgb[i * 3] as number;
    const g = rgb[i * 3 + 1] as number;
    const b = rgb[i * 3 + 2] as number;
    const max = Math.max(r, g, b);
    if (max < NEUTRAL_WHITE_MIN_MAX) continue;
    if (max - Math.min(r, g, b) >= NEUTRAL_WHITE_MAX_CHROMA) continue;
    rs.push(r);
    gs.push(g);
    bs.push(b);
  }
  if (rs.length === 0) return [1, 1, 1];
  const mid = (xs: number[]): number => {
    xs.sort((a, b) => a - b);
    return xs[xs.length >> 1] as number;
  };
  const wr = Math.max(1, mid(rs));
  const wg = Math.max(1, mid(gs));
  const wb = Math.max(1, mid(bs));
  const target = (wr + wg + wb) / 3;
  return [target / wr, target / wg, target / wb];
}

// --- the shared mask -> blobs core ---------------------------------------------------------------

/** One merged coloured blob: a shot, in target mm (geometry-scoring §2). */
export interface BackingBlob {
  xMm: number;
  yMm: number;
  radialMm: number;
  /** The blob's coloured area (§5.4). */
  areaMm2: number;
  /** §5.5: far larger than the median blob, so two shots may share this hole. A hint, not a count. */
  possibleOverlap: boolean;
}

/** How the colour mask was built (§5.1 with a card, §4 without one). */
export type BackingRule = 'hue' | 'chroma';

export interface BackingColourReport {
  blobs: BackingBlob[];
  rule: BackingRule;
  /** The signature the hue rule used, or null when the chroma rule ran. */
  colour: ColourSignature | null;
  /** §4a: coloured blobs in the search area, and the largest blob's area / one hole's area. */
  spots: number;
  largestRatio: number;
  /**
   * M19 Open question 1, measured only by the chroma rule (null for the hue rule): the largest chroma
   * (after the white balance) of any accepted pixel, and the {@link AUTO_RADIUS_QUANTILE} quantile
   * of the accepted pixels' distance from the target centre in mm (null when no pixel is accepted).
   */
  maxChroma: number | null;
  acceptedRadiusP10Mm: number | null;
  sheet: { method: SheetMethod; seedCoverage: number; paperGray: number };
  pxPerMm: number;
}

export interface BackingDetectOptions {
  /** §5.1's 3x3 opening. Only the spec's own "with the opening removed" probe turns it off. */
  opening?: boolean;
}

interface Component {
  area: number;
  sumX: number;
  sumY: number;
}

/** Union-find over components, so a chain of fragments merges into one blob deterministically. */
function findRoot(parent: Int32Array, i: number): number {
  let r = i;
  while ((parent[r] as number) !== r) r = parent[r] as number;
  let c = i;
  while ((parent[c] as number) !== c) {
    const next = parent[c] as number;
    parent[c] = r;
    c = next;
  }
  return r;
}

/**
 * backing-sheet.md §5 steps 1-5, over a boolean colour mask on the rectified square: open, label,
 * drop specks, merge fragments of one torn hole, then flag the outsized blobs.
 */
function blobsFromMask(
  cv: OpenCv,
  mask: Uint8Array,
  rect: Rectified,
  holeDiameterMm: number,
  options: BackingDetectOptions,
): { blobs: BackingBlob[]; largestAreaPx: number } {
  const { side, pxPerMm } = rect;
  const n = side * side;
  const maskMat = new cv.Mat(side, side, cv.CV_8UC1);
  const opened = new cv.Mat();
  const labels = new cv.Mat();
  let kernel: CvMat | null = null;
  try {
    const m = maskMat.data as Uint8Array;
    for (let i = 0; i < n; i += 1) m[i] = mask[i] === 1 ? 255 : 0;

    // §5.1: printed-edge colour fringes are 1-2 px thin and vanish; a hole's coloured core survives.
    if (options.opening === false) {
      maskMat.copyTo(opened);
    } else {
      kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(BACKING_OPEN_PX, BACKING_OPEN_PX));
      cv.morphologyEx(maskMat, opened, cv.MORPH_OPEN, kernel);
    }

    // §5.2: 8-neighbour components, dropped below a fraction of one hole's area.
    const count = cv.connectedComponents(opened, labels, 8, cv.CV_32S) as number;
    const l = labels.data32S as Int32Array;
    const components: Component[] = Array.from({ length: count }, () => ({ area: 0, sumX: 0, sumY: 0 }));
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const label = l[y * side + x] as number;
        if (label <= 0) continue;
        const c = components[label] as Component;
        c.area += 1;
        c.sumX += x;
        c.sumY += y;
      }
    }

    const a1 = holeAreaPx(holeDiameterMm, pxPerMm);
    const kept: Array<{ area: number; x: number; y: number }> = [];
    for (let label = 1; label < count; label += 1) {
      const c = components[label] as Component;
      if (c.area < BACKING_MIN_AREA_FRACTION * a1) continue;
      kept.push({ area: c.area, x: c.sumX / c.area, y: c.sumY / c.area });
    }

    // §5.3: fragments of one torn hole lie within a fraction of a hole diameter; two touching holes
    // lie about a diameter apart. Area-weighted centroid.
    const mergePx = BACKING_MERGE_FRACTION * holeDiameterMm * pxPerMm;
    const parent = new Int32Array(kept.length);
    for (let i = 0; i < kept.length; i += 1) parent[i] = i;
    for (let i = 0; i < kept.length; i += 1) {
      for (let j = i + 1; j < kept.length; j += 1) {
        const a = kept[i] as { area: number; x: number; y: number };
        const b = kept[j] as { area: number; x: number; y: number };
        if (Math.hypot(a.x - b.x, a.y - b.y) > mergePx) continue;
        const ra = findRoot(parent, i);
        const rb = findRoot(parent, j);
        if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
      }
    }
    const merged = new Map<number, { area: number; sumX: number; sumY: number }>();
    for (let i = 0; i < kept.length; i += 1) {
      const k = kept[i] as { area: number; x: number; y: number };
      const root = findRoot(parent, i);
      const acc = merged.get(root) ?? { area: 0, sumX: 0, sumY: 0 };
      acc.area += k.area;
      acc.sumX += k.x * k.area;
      acc.sumY += k.y * k.area;
      merged.set(root, acc);
    }

    const areas = [...merged.values()].map((b) => b.area).sort((a, b) => a - b);
    const median = areas.length === 0 ? 0 : (areas[areas.length >> 1] as number);
    const blobs: BackingBlob[] = [...merged.values()].map((b) => {
      const { xMm, yMm } = rectifiedToMm({ x: b.sumX / b.area, y: b.sumY / b.area }, rect);
      return {
        xMm,
        yMm,
        radialMm: Math.hypot(xMm, yMm),
        areaMm2: b.area / pxPerMm ** 2,
        // §5.5: a hint only — it never changes multiplicity.
        possibleOverlap: median > 0 && b.area >= BACKING_OVERLAP_RATIO * median,
      };
    });
    blobs.sort((a, b) => a.radialMm - b.radialMm || a.xMm - b.xMm || a.yMm - b.yMm);
    return { blobs, largestAreaPx: areas.length === 0 ? 0 : (areas[areas.length - 1] as number) };
  } finally {
    maskMat.delete();
    opened.delete();
    labels.delete();
    kernel?.delete();
  }
}

/** The rectified colour view plus the searched sheet area (REV-36) both §4a and §5 work over. */
interface BackingView {
  rect: Rectified;
  rgb: Uint8Array;
  searchable: Uint8Array;
  sheet: ReturnType<typeof findSheet>;
}

function rectifyForBacking(
  cv: OpenCv,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
): BackingView {
  const rect = rectify(cv, img, calibration, template, {
    pxPerMm: DETECTION_PX_PER_MM,
    radiusMm: SHEET_SEARCH_CAP_MM,
    chroma: true,
    rgb: true,
  });
  const sheet = findSheet(cv, rect, template);
  return { rect, rgb: rect.rgb?.data as Uint8Array, searchable: sheet.mask, sheet };
}

function releaseRect(rect: Rectified): void {
  rect.gray.delete();
  rect.valid.delete();
  rect.chroma?.delete();
  rect.rgb?.delete();
}

/**
 * Rectifies once and releases the Mats afterwards. Every report the callback builds is plain data, so
 * it outlives the view — which is what lets `Auto` run the §4a probe and the §5 hue detection over a
 * single warp instead of two (analysis-pipeline §9's budget: the warp plus `findSheet` is the most
 * expensive thing A5 does on a phone).
 */
function withBackingView<T>(
  cv: OpenCv,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
  measure: (view: BackingView) => T,
): T {
  const view = rectifyForBacking(cv, img, calibration, template);
  try {
    return measure(view);
  } finally {
    releaseRect(view.rect);
  }
}

/** §5.1: the hue rule, from a card's signature. No minimum brightness is applied. */
function hueMask(rgb: Uint8Array, searchable: Uint8Array, colour: ColourSignature): Uint8Array {
  const limit = colour.hueSpreadDeg + BACKING_HUE_MARGIN_DEG;
  const satMin = Math.max(BACKING_SAT_FLOOR, BACKING_SAT_P10_FACTOR * colour.satP10);
  const mask = new Uint8Array(searchable.length);
  for (let i = 0; i < searchable.length; i += 1) {
    if (searchable[i] !== 1) continue;
    const hsv = rgbToHsv(rgb[i * 3] as number, rgb[i * 3 + 1] as number, rgb[i * 3 + 2] as number);
    if (hsv.sat < satMin) continue;
    if (hueDistance(hsv.hueDeg, colour.hueDeg) > limit) continue;
    mask[i] = 1;
  }
  return mask;
}

/**
 * §4: the neutral-chroma rule — the paper's colour cast removed, then anything clearly coloured.
 * Also returns the largest accepted chroma, which `Auto`'s fluorescence floor reads.
 */
function chromaMask(rgb: Uint8Array, searchable: Uint8Array): { mask: Uint8Array; maxChroma: number } {
  const [gr, gg, gb] = whiteBalanceGains(rgb, searchable);
  const mask = new Uint8Array(searchable.length);
  let maxChroma = 0;
  for (let i = 0; i < searchable.length; i += 1) {
    if (searchable[i] !== 1) continue;
    const r = Math.min(255, (rgb[i * 3] as number) * gr);
    const g = Math.min(255, (rgb[i * 3 + 1] as number) * gg);
    const b = Math.min(255, (rgb[i * 3 + 2] as number) * gb);
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma < NEUTRAL_CHROMA_MIN) continue;
    mask[i] = 1;
    if (chroma > maxChroma) maxChroma = chroma;
  }
  return { mask, maxChroma };
}

/**
 * M19 Open question 1's radial rule: the {@link AUTO_RADIUS_QUANTILE} quantile of the accepted
 * pixels' distance from the target centre, in mm. Null when nothing was accepted.
 */
function acceptedRadiusQuantileMm(mask: Uint8Array, rect: Rectified): number | null {
  const { side, pxPerMm } = rect;
  const centre = side / 2;
  const radii: number[] = [];
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      if (mask[y * side + x] !== 1) continue;
      radii.push(Math.hypot(x - centre, centre - y) / pxPerMm);
    }
  }
  if (radii.length === 0) return null;
  radii.sort((a, b) => a - b);
  return quantile(radii, AUTO_RADIUS_QUANTILE);
}

/**
 * backing-sheet.md §5 steps 1-5. The holes as merged coloured blobs, using the card's hue when the
 * session has a measured colour and the neutral-chroma rule otherwise. `calibration` is in the pixel
 * space of `img`; the blobs come back in target mm.
 */
export function detectByBackingColour(
  cv: OpenCv,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
  holeDiameterMm: number,
  colour: ColourSignature | null,
  options: BackingDetectOptions = {},
): BackingColourReport {
  return withBackingView(cv, img, calibration, template, (view) =>
    reportFromView(cv, view, holeDiameterMm, colour, options),
  );
}

/** §5 steps 1-5 over an already-rectified view, so one warp can serve both masks. */
function reportFromView(
  cv: OpenCv,
  view: BackingView,
  holeDiameterMm: number,
  colour: ColourSignature | null,
  options: BackingDetectOptions = {},
): BackingColourReport {
  const { rect, rgb, searchable, sheet } = view;
  const chroma = colour === null ? chromaMask(rgb, searchable) : null;
  const mask = chroma !== null ? chroma.mask : hueMask(rgb, searchable, colour as ColourSignature);
  const { blobs, largestAreaPx } = blobsFromMask(cv, mask, rect, holeDiameterMm, options);
  return {
    blobs,
    rule: colour === null ? 'chroma' : 'hue',
    colour,
    spots: blobs.length,
    largestRatio: largestAreaPx / holeAreaPx(holeDiameterMm, rect.pxPerMm),
    maxChroma: chroma?.maxChroma ?? null,
    acceptedRadiusP10Mm: chroma !== null ? acceptedRadiusQuantileMm(chroma.mask, rect) : null,
    sheet: { method: sheet.method, seedCoverage: sheet.seedCoverage, paperGray: sheet.paperGray },
    pxPerMm: rect.pxPerMm,
  };
}

/**
 * backing-sheet.md §5.4: each merged blob is one shot with `multiplicity: 1` (REV-28 still holds).
 * Ids are `auto-1 …` in ascending radial order, as A5's standard path numbers them. The colour path
 * scores no confidence, so it reports none — but it does carry the blob's coloured area (§5.4), which
 * is what REV-28's cap ranks colour-path shots by when there are more than the declared rounds
 * (§5.7; `capShots` falls back to the radial distance only when neither is known).
 */
export function backingBlobsToShots(blobs: BackingBlob[]): CappableShot[] {
  return blobs.map((blob, index) => ({
    id: `auto-${index + 1}`,
    xMm: blob.xMm,
    yMm: blob.yMm,
    multiplicity: 1,
    positionOverrides: null,
    source: 'auto' as const,
    confidence: null,
    cluster: false,
    possibleOverlap: blob.possibleOverlap,
    areaMm2: blob.areaMm2,
  }));
}

export interface BackingPresence {
  present: boolean;
  spots: number;
  largestRatio: number;
  /** M19 Open question 1: the fluorescence and radial measurements (see {@link BackingColourReport}). */
  maxChroma: number;
  acceptedRadiusP10Mm: number | null;
  /** Why `Auto` said no, or null when it said present. */
  reason: string | null;
}

/**
 * `Auto`'s verdict from a neutral-chroma probe. Checked in this order, so the recorded reason names
 * the first rule that failed: a coloured area far bigger than a hole, too few spots (§4a), nothing
 * fluorescent (the chroma floor), or the colour lying outside the rings (the radial rule). The last
 * two are the owner's ruling on M19 Open question 1: they fail differently — the floor catches a
 * bright board, the radial rule a dull one — so both apply.
 */
function autoRefusal(probe: BackingColourReport, template: TemplateId): string | null {
  if (probe.largestRatio > AUTO_MAX_BLOB_RATIO) return AUTO_LARGE_AREA_REASON;
  if (probe.spots < AUTO_MIN_SPOTS) return AUTO_NO_SPOTS_REASON;
  if ((probe.maxChroma ?? 0) < AUTO_MIN_CHROMA) return AUTO_DULL_COLOUR_REASON;
  if (probe.acceptedRadiusP10Mm === null || probe.acceptedRadiusP10Mm > outerRadiusMm(template)) {
    return AUTO_OUTSIDE_RINGS_REASON;
  }
  return null;
}

/**
 * backing-sheet.md §4a (`Auto`). Present when there are at least {@link AUTO_MIN_SPOTS} coloured
 * blobs and none of them is more than {@link AUTO_MAX_BLOB_RATIO} times a hole's area — a coloured
 * area far bigger than a hole is scenery, a backing board or a sticker in frame, not a hole — and,
 * per M19 Open question 1, the colour is fluorescent ({@link AUTO_MIN_CHROMA}) and sits where holes
 * can be (the accepted pixels' radius p10 inside the template's outermost circle).
 *
 * The spec writes this as `detectBackingPresence(img, calibration)`; the template and the calibre are
 * needed to rectify and to size a hole, exactly as A5 needs them (see the milestone's Open questions).
 */
export function detectBackingPresence(
  cv: OpenCv,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
  holeDiameterMm: number,
): BackingPresence {
  const report = detectByBackingColour(cv, img, calibration, template, holeDiameterMm, null);
  const reason = autoRefusal(report, template);
  return {
    present: reason === null,
    spots: report.spots,
    largestRatio: report.largestRatio,
    maxChroma: report.maxChroma ?? 0,
    acceptedRadiusP10Mm: report.acceptedRadiusP10Mm,
    reason,
  };
}

/**
 * backing-sheet.md §4, "without a card": the backing's colour measured off a target photo instead of
 * a card, by taking the hue statistics of the pixels the neutral-chroma rule accepts inside the
 * searched sheet area. Returns `null` when nothing there is clearly coloured. This is what a
 * `BackingSheet` with `source: 'estimated'` carries; the detection path itself does not need it (§5
 * uses the chroma rule directly when there is no card), and `pnpm cv:eval` reports it as the colour
 * signature a backed photo shows.
 */
export function estimateBackingColour(
  cv: OpenCv,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
): ColourSignature | null {
  return withBackingView(cv, img, calibration, template, ({ rgb, searchable }) => {
    const { mask } = chromaMask(rgb, searchable);
    const hues: number[] = [];
    const sats: number[] = [];
    const vals: number[] = [];
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] !== 1) continue;
      const hsv = rgbToHsv(rgb[i * 3] as number, rgb[i * 3 + 1] as number, rgb[i * 3 + 2] as number);
      hues.push(hsv.hueDeg);
      sats.push(hsv.sat);
      vals.push(hsv.val);
    }
    return signatureFrom(hues, sats, vals);
  });
}

// --- A5's branch (analysis-pipeline §2 A5, backing-sheet.md §5) ----------------------------------

/** §4a: why `Auto` decided a photo is not backed. */
export const AUTO_LARGE_AREA_REASON = 'large coloured area';
/** §4a: the other way `Auto` says no — fewer than {@link AUTO_MIN_SPOTS} coloured blobs. */
export const AUTO_NO_SPOTS_REASON = 'no coloured spots';
/** M19 Open question 1: the colour is not fluorescent enough to be a backing sheet ({@link AUTO_MIN_CHROMA}). */
export const AUTO_DULL_COLOUR_REASON = 'colour too dull for a backing';
/** M19 Open question 1: the colour lies outside the rings — the board or scenery, not the holes. */
export const AUTO_OUTSIDE_RINGS_REASON = 'colour outside the rings';
/** §5.6: the colour path ran and found nothing, so the standard detector ran instead. */
export const COLOUR_NOT_FOUND_REASON = 'no backing colour showed through';

/**
 * §5.6: the colour path was chosen for this photo but found nothing, so the standard detector ran —
 * exactly the case that carries the `backing-colour-not-found` warning.
 */
export function usedBackingFallback(detection: DetectionRecord): boolean {
  return detection.method === 'standard' && (detection.backing === 'forced' || detection.backing === 'detected');
}

export interface BackingShotsResult {
  /** Colour-path shots carry the blob's coloured area (§5.4); the standard path carries confidence. */
  shots: CappableShot[];
  detection: DetectionRecord;
}

/**
 * analysis-pipeline §2 (A5) with the coloured backing (backing-sheet.md §5). `none` never uses
 * colour, `coloured` always does, and `auto` asks §4a per photo. Whichever path runs, the shots come
 * back in target mm with `multiplicity: 1` (REV-28); capping to the declared rounds is Stage A's job.
 */
export function detectShotsWithBacking(
  cv: OpenCv,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
  holeDiameterMm: number,
  backing: { mode: BackingMode; colour: ColourSignature | null },
): BackingShotsResult {
  const standard = (record: DetectionRecord): BackingShotsResult => ({
    shots: detectShots(cv, img, calibration, template, holeDiameterMm),
    detection: record,
  });

  if (backing.mode === 'none') {
    return standard({ method: 'standard', backing: 'off', fallbackReason: null });
  }

  let state: 'forced' | 'detected';
  let report: BackingColourReport;
  if (backing.mode === 'coloured') {
    state = 'forced';
    report = detectByBackingColour(cv, img, calibration, template, holeDiameterMm, backing.colour);
  } else {
    // §4a: the presence test always uses the neutral-chroma mask — and, when the session has a card,
    // the hue detection that follows reuses the same rectified view rather than warping twice.
    const decision = withBackingView(cv, img, calibration, template, (view) => {
      const probe = reportFromView(cv, view, holeDiameterMm, null);
      const reason = autoRefusal(probe, template);
      if (reason !== null) return { present: false as const, reason };
      // §4a: with `Auto`, a card photo is still used when the session has one.
      return {
        present: true as const,
        report: backing.colour === null ? probe : reportFromView(cv, view, holeDiameterMm, backing.colour),
      };
    });
    if (!decision.present) {
      return standard({ method: 'standard', backing: 'not-detected', fallbackReason: decision.reason });
    }
    state = 'detected';
    report = decision.report;
  }

  // §5.6: zero blobs means the colour told us nothing, so the standard detector runs instead.
  if (report.blobs.length === 0) {
    return standard({ method: 'standard', backing: state, fallbackReason: COLOUR_NOT_FOUND_REASON });
  }
  return {
    shots: backingBlobsToShots(report.blobs),
    detection: { method: 'colour', backing: state, fallbackReason: null },
  };
}
