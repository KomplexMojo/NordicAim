// M16 R1 / REV-27. What is measured around one hole candidate, in rectified px, so `holes.ts` can
// decide whether to keep it: its core contrast, how clean its surroundings are, and the connected
// blob of deviating pixels it sits on (area, elongation, maximum inscribed radius). Pure; no DOM.

import type { HoleSignal } from './hole-signal';

/** The core whose median contrast is read, as a fraction of the hole radius. */
const CORE_FRACTION = 0.6;
/** The surround ring, in hole radii. */
const SURROUND_INNER = 1.6;
const SURROUND_OUTER = 3;
/** The blob is the deviating component nearest the peak, found within this many hole radii... */
const BLOB_SEARCH = 2;
/** ...and it must start within this many. */
const BLOB_START_MAX = 1.5;
/** A blob is measured up to this many pixels; larger ones are merged print or clusters anyway. */
const BLOB_MAX_PX = 5000;

export interface CandidateFeatures {
  /** Median of gray minus background over the core, signed (negative = darker than its surface). */
  coreContrast: number;
  /** Share of the surround ring that deviates. */
  surround: number;
  /** Blob area in px (0 when no blob starts near the peak). */
  blobAreaPx: number;
  /** major / minor from the blob's second moments (1 for a disc). */
  elongation: number;
  /** Maximum inscribed radius of the blob, in px. */
  strokeRadiusPx: number;
}

/**
 * Measures one candidate. `distance` is the distance transform of `signal.deviates` (px to the
 * nearest non-deviating pixel), computed once per photo by the caller.
 */
export function measureCandidate(
  gray: Uint8Array,
  side: number,
  signal: HoleSignal,
  distance: Float32Array,
  peak: { x: number; y: number },
  holeRadiusPx: number,
): CandidateFeatures {
  const reach = Math.ceil(SURROUND_OUTER * holeRadiusPx);
  const core: number[] = [];
  let ring = 0;
  let ringDeviating = 0;
  let start = -1;
  let startDistance = Number.POSITIVE_INFINITY;

  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const x = peak.x + dx;
      const y = peak.y + dy;
      if (x < 0 || y < 0 || x >= side || y >= side) continue;
      const i = y * side + x;
      const d = Math.hypot(dx, dy);
      if (d <= CORE_FRACTION * holeRadiusPx) core.push((gray[i] as number) - (signal.background[i] as number));
      if (d >= SURROUND_INNER * holeRadiusPx && d <= SURROUND_OUTER * holeRadiusPx) {
        ring += 1;
        if (signal.deviates[i] === 1) ringDeviating += 1;
      }
      if (d <= BLOB_SEARCH * holeRadiusPx && signal.deviates[i] === 1 && d < startDistance) {
        startDistance = d;
        start = i;
      }
    }
  }
  core.sort((a, b) => a - b);

  let area = 0;
  let stroke = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  if (start >= 0 && startDistance <= BLOB_START_MAX * holeRadiusPx) {
    const seen = new Set<number>([start]);
    const stack = [start];
    while (stack.length > 0 && area < BLOB_MAX_PX) {
      const i = stack.pop() as number;
      const x = i % side;
      const y = (i / side) | 0;
      area += 1;
      stroke = Math.max(stroke, distance[i] as number);
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      const neighbours = [x > 0 ? i - 1 : -1, x < side - 1 ? i + 1 : -1, y > 0 ? i - side : -1, y < side - 1 ? i + side : -1];
      for (const j of neighbours) {
        if (j < 0 || seen.has(j) || signal.deviates[j] !== 1) continue;
        seen.add(j);
        stack.push(j);
      }
    }
  }

  let elongation = 0;
  if (area > 3) {
    const mx = sx / area;
    const my = sy / area;
    const a = sxx / area - mx * mx;
    const b = syy / area - my * my;
    const c = sxy / area - mx * my;
    const half = Math.sqrt(Math.max(0, ((a + b) * (a + b)) / 4 - (a * b - c * c)));
    const major = (a + b) / 2 + half;
    const minor = (a + b) / 2 - half;
    elongation = Math.sqrt(major / Math.max(1e-6, minor));
  }

  return {
    coreContrast: core.length === 0 ? 0 : (core[core.length >> 1] as number),
    surround: ring === 0 ? 0 : ringDeviating / ring,
    blobAreaPx: area,
    elongation,
    strokeRadiusPx: stroke,
  };
}
