// backing-sheet.md §5 (REV-38): the shared colour mask -> merged blobs core, in target mm. Split out of `backing-colour.ts`
// (issue #24); pure over OpenCV Mats.

import type { ColourSignature } from '@/lib/domain/backing';

import { BACKING_MERGE_FRACTION, BACKING_MIN_AREA_FRACTION, BACKING_OPEN_PX, BACKING_OVERLAP_RATIO } from './constants';
import { holeAreaPx } from './holes';
import type { CvMat, OpenCv } from './opencv';
import { rectifiedToMm, type Rectified } from './rectify';
import type { SheetMethod } from './sheet';

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
  /** REV-39 (M20): the coloured area over the photo's median blob area — the overlap evidence. */
  overlapRatio: number;
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
export function blobsFromMask(
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
        overlapRatio: median > 0 ? b.area / median : 0,
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
