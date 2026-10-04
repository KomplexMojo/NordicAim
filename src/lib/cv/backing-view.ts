// backing-sheet.md §4a, §5 (REV-38): the rectified colour view, the hue and chroma masks, and `detectByBackingColour`. Split
// out of `backing-colour.ts` (issue #24); pure over `RgbaImage` and OpenCV Mats.

import type { ColourSignature } from '@/lib/domain/backing';
import type { TemplateId } from '@/lib/domain/enums';
import type { CalibrationLike } from '@/lib/geometry/transform';
import type { RgbaImage } from '@/lib/media/format';

import {
  AUTO_RADIUS_QUANTILE,
  BACKING_HUE_MARGIN_DEG,
  BACKING_SAT_FLOOR,
  BACKING_SAT_P10_FACTOR,
  DETECTION_PX_PER_MM,
  NEUTRAL_CHROMA_MIN,
  SHEET_SEARCH_CAP_MM,
} from './constants';
import { holeAreaPx } from './holes';
import type { OpenCv } from './opencv';
import { rectify, type Rectified } from './rectify';
import { findSheet } from './sheet';

import { type BackingColourReport, type BackingDetectOptions, blobsFromMask } from './backing-blobs';
import { hueDistance, quantile, rgbToHsv, whiteBalanceGains } from './backing-hue';

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
export function withBackingView<T>(
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
export function chromaMask(rgb: Uint8Array, searchable: Uint8Array): { mask: Uint8Array; maxChroma: number } {
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
export function reportFromView(
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
