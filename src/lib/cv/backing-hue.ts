// backing-sheet.md §4 (REV-38): HSV, hue statistics, the card signature and the neutral-chroma white balance. Split out of
// `backing-colour.ts` (issue #24); pure, no DOM, no clock, no randomness.

import type { ColourSignature } from '@/lib/domain/backing';
import type { RgbaImage } from '@/lib/media/format';

import {
  CARD_MIN_KEPT_FRACTION,
  CARD_REGION_FRACTION,
  CARD_SAT_MIN,
  CARD_VAL_MIN,
  NEUTRAL_WHITE_MAX_CHROMA,
  NEUTRAL_WHITE_MIN_MAX,
} from './constants';

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
export function quantile(sorted: number[], p: number): number {
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

export function signatureFrom(hues: number[], sats: number[], vals: number[]): ColourSignature | null {
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
