// M16 step 1 / REV-32. Scans the rectified sheet region by region with local statistics instead of
// the two global thresholds M11 step 3 applied to the whole sheet. One pair of numbers for a whole
// sheet cannot cope with shadow across the paper, glare, or the different contrast of a hole on the
// black aiming mark versus on white paper; a tile's own median and MAD can.
//
// The owner's rule: a tile that yields nothing is dropped and the scan moves on (most of a sheet is
// blank, which is also where the time is saved); a tile that yields something is refined further.
// Refinement is bounded and NEVER chases a shot quota — whatever is still missing stays missing and
// becomes a parked marker for the owner (REV-29).
//
// Pure over OpenCV Mats; no DOM.

import { measureComponents, type ComponentMetrics } from './component-metrics';
import {
  REGION_K,
  REGION_MAD_FLOOR,
  REGION_MM,
  REGION_REFINE_FACTOR,
  REGION_REFINE_MAX,
} from './constants';
import { REGION_DISC, REGION_PAPER, morphMask, type RegionMaps } from './hole-mask';
import type { OpenCv } from './opencv';
import type { Rectified } from './rectify';

/** A tile's median and MAD mean nothing when almost none of it is the class being measured. */
const MIN_TILE_SAMPLES = 64;
/**
 * Cheap pre-check before any OpenCV call: a tile whose raw candidate pixels cannot reach the area
 * gate even before the CLOSE is skipped outright. Half the gate, because the CLOSE can only add
 * pixels and the OPEN only removes them at the boundary.
 */
const PRECHECK_FRACTION = 0.5;

export interface TileStats {
  /** Tiles whose centre fell inside the search area, so they were looked at at all. */
  scanned: number;
  /** Tiles that produced at least one candidate and were therefore refined. */
  withCandidates: number;
  /** Refinement passes run in total (`withCandidates * REGION_REFINE_MAX`). */
  refined: number;
}

export interface RegionScanResult {
  /** Accepted components, deduped, in rectified px. */
  components: ComponentMetrics[];
  /** Components the `accept` predicate rejected, deduped, in rectified px. */
  rejected: ComponentMetrics[];
  tiles: TileStats;
}

interface TileWindow {
  x0: number;
  y0: number;
  w: number;
  h: number;
  cls: number;
}

interface TileLevel {
  median: number;
  mad: number;
  sign: number;
}

/** Median and MAD of the tile's own class, from 256-bin histograms (exact for 8-bit). */
function tileLevel(gray: Uint8Array, maps: RegionMaps, side: number, win: TileWindow): TileLevel | null {
  const histogram = new Int32Array(256);
  let count = 0;
  for (let y = win.y0; y < win.y0 + win.h; y += 1) {
    const row = y * side;
    for (let x = win.x0; x < win.x0 + win.w; x += 1) {
      const i = row + x;
      if (maps.region[i] !== win.cls || maps.banded[i] === 1) continue;
      const value = gray[i] as number;
      histogram[value] = (histogram[value] as number) + 1;
      count += 1;
    }
  }
  if (count < MIN_TILE_SAMPLES) return null;

  let cumulative = 0;
  let median = 255;
  for (let value = 0; value < 256; value += 1) {
    cumulative += histogram[value] as number;
    if (cumulative * 2 >= count) {
      median = value;
      break;
    }
  }

  const deviations = new Int32Array(256);
  for (let value = 0; value < 256; value += 1) {
    const n = histogram[value] as number;
    if (n === 0) continue;
    const d = Math.abs(value - median);
    deviations[d] = (deviations[d] as number) + n;
  }
  cumulative = 0;
  let mad = 255;
  for (let d = 0; d < 256; d += 1) {
    cumulative += deviations[d] as number;
    if (cumulative * 2 >= count) {
      mad = d;
      break;
    }
  }

  // A hole is BRIGHTER than the aiming mark and DARKER than the paper, so the sign of the test
  // follows the tile's class.
  return { median, mad: Math.max(mad, REGION_MAD_FLOOR), sign: win.cls === REGION_DISC ? 1 : -1 };
}

/** One threshold pass over one tile, at one `k`. Coordinates come back in rectified px. */
function tilePass(
  cv: OpenCv,
  rect: Rectified,
  maps: RegionMaps,
  win: TileWindow,
  level: TileLevel,
  k: number,
  minAreaPx: number,
): ComponentMetrics[] {
  const gray = rect.gray.data as Uint8Array;
  const side = rect.side;
  const cut = k * level.mad;

  const raw = new Uint8Array(win.w * win.h);
  let hits = 0;
  for (let y = 0; y < win.h; y += 1) {
    const row = (win.y0 + y) * side;
    const outRow = y * win.w;
    for (let x = 0; x < win.w; x += 1) {
      const i = row + win.x0 + x;
      // Printed circle lines are erased before anything else, exactly as in M11 step 4, and pixels
      // of the other class never take part: a slice of the black mark inside a paper tile is not a
      // hole, it is the mark.
      if (maps.region[i] !== win.cls || maps.banded[i] === 1) continue;
      const delta = ((gray[i] as number) - level.median) * level.sign;
      if (delta <= cut) continue;
      raw[outRow + x] = 255;
      hits += 1;
    }
  }
  if (hits < minAreaPx * PRECHECK_FRACTION) return [];

  const mask = morphMask(cv, raw, win.w, win.h);
  try {
    return measureComponents(cv, mask, minAreaPx).map((component) => ({
      ...component,
      x: component.x + win.x0,
      y: component.y + win.y0,
    }));
  } finally {
    mask.delete();
  }
}

/**
 * Best copy of a hole first: a component that is whole beats one cut off by a tile boundary, then
 * the fuller outline wins, then the larger one. Total and deterministic.
 */
function better(a: ComponentMetrics, b: ComponentMetrics): number {
  return (
    Number(a.touchesEdge) - Number(b.touchesEdge) ||
    b.fill - a.fill ||
    b.areaPx - a.areaPx ||
    a.x - b.x ||
    a.y - b.y
  );
}

/** REV-32: two candidates within one hole radius are the same hole; keep the better copy. */
function dedupe(found: ComponentMetrics[], radiusPx: number): ComponentMetrics[] {
  const kept: ComponentMetrics[] = [];
  for (const component of [...found].sort(better)) {
    if (kept.some((other) => Math.hypot(other.x - component.x, other.y - component.y) < radiusPx)) continue;
    kept.push(component);
  }
  return kept;
}

export interface RegionScanOptions {
  minAreaPx: number;
  /** Two centroids closer than this are the same hole (one hole radius). */
  dedupeRadiusPx: number;
  /** REV-27's glyph filter. Refinement keeps only components that pass it. */
  accept: (component: ComponentMetrics) => boolean;
  /** Tuning overrides; each defaults to its constant. Used by `cv:eval` to measure the alternatives. */
  tuning?: RegionTuning;
}

/** The three constants M16 step 1 asks to be measured, overridable so `cv:eval` can sweep them. */
export interface RegionTuning {
  regionMm?: number;
  k?: number;
  refineMax?: number;
}

/**
 * M16 step 1. Tiles the rectified image into `REGION_MM` squares at half-tile stride, thresholds each
 * tile against its own median and MAD, skips the empty ones, refines the rest at up to
 * `REGION_REFINE_MAX` progressively lower `REGION_K` values, and dedupes what is left by centroid.
 *
 * REV-33: a tile whose centre is outside the search area (`region` is `REGION_NONE` there) is never
 * scanned, so the backing board beside the sheet cannot contribute a candidate.
 */
export function scanRegions(
  cv: OpenCv,
  rect: Rectified,
  maps: RegionMaps,
  options: RegionScanOptions,
): RegionScanResult {
  const regionMm = options.tuning?.regionMm ?? REGION_MM;
  const startK = options.tuning?.k ?? REGION_K;
  const refineMax = options.tuning?.refineMax ?? REGION_REFINE_MAX;
  const tilePx = Math.max(3, Math.round(regionMm * rect.pxPerMm));
  const stride = Math.max(1, Math.round(tilePx / 2));

  const accepted: ComponentMetrics[] = [];
  const rejected: ComponentMetrics[] = [];
  const tiles: TileStats = { scanned: 0, withCandidates: 0, refined: 0 };

  for (let y0 = 0; y0 < rect.side; y0 += stride) {
    for (let x0 = 0; x0 < rect.side; x0 += stride) {
      const w = Math.min(tilePx, rect.side - x0);
      const h = Math.min(tilePx, rect.side - y0);
      if (w < 3 || h < 3) continue;

      const cls = maps.region[(y0 + (h >> 1)) * rect.side + x0 + (w >> 1)] as number;
      if (cls !== REGION_DISC && cls !== REGION_PAPER) continue;
      const win: TileWindow = { x0, y0, w, h, cls };
      const level = tileLevel(rect.gray.data as Uint8Array, maps, rect.side, win);
      if (level === null) continue;
      tiles.scanned += 1;

      const first = tilePass(cv, rect, maps, win, level, startK, options.minAreaPx);
      const firstAccepted = first.filter(options.accept);
      if (firstAccepted.length === 0) continue; // empty region: skip it and move on

      tiles.withCandidates += 1;
      accepted.push(...firstAccepted);
      rejected.push(...first.filter((component) => !options.accept(component)));

      // Refine only the affected region, and only a fixed number of times.
      let k = startK;
      for (let pass = 0; pass < refineMax; pass += 1) {
        k *= REGION_REFINE_FACTOR;
        tiles.refined += 1;
        const found = tilePass(cv, rect, maps, win, level, k, options.minAreaPx);
        accepted.push(...found.filter(options.accept));
        rejected.push(...found.filter((component) => !options.accept(component)));
      }
    }
  }

  return {
    components: dedupe(accepted, options.dedupeRadiusPx),
    rejected: dedupe(rejected, options.dedupeRadiusPx),
    tiles,
  };
}
