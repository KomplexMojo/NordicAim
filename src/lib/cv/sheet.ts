// M16 R3 (REV-36). Finds the paper sheet the target is printed on, so detection searches all of it —
// holes on the white paper are found — while the backing board beside the sheet stays excluded
// (REV-33's intent). Pure over OpenCV Mats; no DOM.
//
// The sheet is the region that looks like the paper just outside the outermost printed circle and is
// connected to it: as bright as that paper (or darker by at most a shadow), of the same chroma, and
// not across a sharp edge. Everything it encloses (the target, printed text, holes) is filled in, and
// the result is eroded so the sheet's own edge is never a candidate.

import type { TemplateId } from '@/lib/domain/enums';

import {
  SHEET_CHROMA_RATIO_DELTA,
  SHEET_EDGE_MAX,
  SHEET_ERODE_MM,
  SHEET_FALLBACK_RADIUS_MM,
  SHEET_GRAY_DROP,
  SHEET_MIN_PAPER_GRAY,
  SHEET_MIN_SEED_COVERAGE,
  SHEET_OPEN_MM,
  SHEET_SEARCH_CAP_MM,
  SHEET_SEED_INNER_MM,
  SHEET_SEED_OUTER_MM,
} from './constants';
import type { CvMat, OpenCv } from './opencv';
import { outerRadiusMm, type Rectified } from './rectify';

/** A share of the reference annulus a paper component must hold to count as the sheet. */
const MIN_COMPONENT_SEED_SHARE = 0.05;
/** Sobel 3x3 gain: a unit step reads as 4 per pixel on each axis, so the magnitude is divided by it. */
const SOBEL_GAIN = 8;

export type SheetMethod = 'segmented' | 'fallback';

export interface SheetResult {
  /** 1 where detection may search, over the rectified square. */
  mask: Uint8Array;
  /** `fallback` when segmentation failed and the {@link SHEET_FALLBACK_RADIUS_MM} circle was used. */
  method: SheetMethod;
  /** The share of the reference annulus that looked like paper. */
  seedCoverage: number;
  /** The reference annulus's median gray (NaN when it is off the photo). */
  paperGray: number;
}

function oddPx(mm: number, pxPerMm: number): number {
  return Math.max(3, Math.round(mm * pxPerMm) | 1);
}

function median(values: Uint8Array | Float32Array, select: Uint8Array): number {
  const sorted: number[] = [];
  for (let i = 0; i < select.length; i += 1) if (select[i] === 1) sorted.push(values[i] as number);
  sorted.sort((a, b) => a - b);
  return sorted.length === 0 ? Number.NaN : (sorted[sorted.length >> 1] as number);
}

/** The {@link SHEET_FALLBACK_RADIUS_MM} circle, clipped to the photo. */
function fallbackMask(rect: Rectified, valid: Uint8Array): Uint8Array {
  const { side, pxPerMm } = rect;
  const centre = side / 2;
  const limit = SHEET_FALLBACK_RADIUS_MM * pxPerMm;
  const mask = new Uint8Array(side * side);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const i = y * side + x;
      if (valid[i] !== 0 && Math.hypot(x - centre, y - centre) <= limit) mask[i] = 1;
    }
  }
  return mask;
}

/** Everything not reachable from the square's border without crossing `region` is inside it. */
function fillEnclosed(region: Uint8Array, side: number): Uint8Array {
  const outside = new Uint8Array(side * side);
  const stack: number[] = [];
  const push = (i: number): void => {
    if (outside[i] === 1 || region[i] === 1) return;
    outside[i] = 1;
    stack.push(i);
  };
  for (let k = 0; k < side; k += 1) {
    push(k);
    push((side - 1) * side + k);
    push(k * side);
    push(k * side + side - 1);
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % side;
    if (x > 0) push(i - 1);
    if (x < side - 1) push(i + 1);
    if (i >= side) push(i - side);
    if (i < side * (side - 1)) push(i + side);
  }
  const filled = new Uint8Array(side * side);
  for (let i = 0; i < filled.length; i += 1) filled[i] = outside[i] === 1 ? 0 : 1;
  return filled;
}

/**
 * R3. The search area for hole detection over `rect` (which must carry `chroma`). Falls back to the
 * {@link SHEET_FALLBACK_RADIUS_MM} circle when the reference annulus does not look like paper.
 */
export function findSheet(cv: OpenCv, rect: Rectified, template: TemplateId): SheetResult {
  const { side, pxPerMm } = rect;
  const n = side * side;
  const centre = side / 2;
  const valid = rect.valid.data as Uint8Array;
  if (rect.chroma === null) throw new Error('findSheet needs a rectified chroma channel');

  const outerPx = outerRadiusMm(template) * pxPerMm;
  const seed = new Uint8Array(n);
  const radius = new Float32Array(n);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const i = y * side + x;
      const r = Math.hypot(x - centre, y - centre);
      radius[i] = r;
      if (valid[i] !== 0 && r >= outerPx + SHEET_SEED_INNER_MM * pxPerMm && r <= outerPx + SHEET_SEED_OUTER_MM * pxPerMm) {
        seed[i] = 1;
      }
    }
  }

  const mats: CvMat[] = [];
  const track = <T extends CvMat>(mat: T): T => {
    mats.push(mat);
    return mat;
  };
  try {
    const grayBlur = track(new cv.Mat());
    const chromaBlur = track(new cv.Mat());
    const k = oddPx(1.5, pxPerMm);
    cv.GaussianBlur(rect.gray, grayBlur, new cv.Size(k, k), 0);
    cv.GaussianBlur(rect.chroma, chromaBlur, new cv.Size(2 * k + 1, 2 * k + 1), 0);
    const gx = track(new cv.Mat());
    const gy = track(new cv.Mat());
    cv.Sobel(grayBlur, gx, cv.CV_32F, 1, 0, 3);
    cv.Sobel(grayBlur, gy, cv.CV_32F, 0, 1, 3);
    const g = grayBlur.data as Uint8Array;
    const ch = chromaBlur.data as Uint8Array;
    const gxd = gx.data32F as Float32Array;
    const gyd = gy.data32F as Float32Array;

    const grayRef = median(g, seed);
    const chromaRatioRef = median(ch, seed) / Math.max(1, grayRef);

    const paper = track(cv.Mat.zeros(side, side, cv.CV_8UC1));
    const p = paper.data as Uint8Array;
    for (let i = 0; i < n; i += 1) {
      if (valid[i] === 0) continue;
      const gi = g[i] as number;
      if (gi < grayRef - SHEET_GRAY_DROP) continue;
      if (Math.abs((ch[i] as number) / Math.max(1, gi) - chromaRatioRef) > SHEET_CHROMA_RATIO_DELTA) continue;
      if (Math.hypot(gxd[i] as number, gyd[i] as number) / SOBEL_GAIN > SHEET_EDGE_MAX) continue;
      p[i] = 255;
    }

    const opened = track(new cv.Mat());
    const openPx = oddPx(SHEET_OPEN_MM, pxPerMm);
    const openKernel = track(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(openPx, openPx)));
    cv.morphologyEx(paper, opened, cv.MORPH_OPEN, openKernel);

    const labels = track(new cv.Mat());
    const count = cv.connectedComponents(opened, labels, 8, cv.CV_32S) as number;
    const l = labels.data32S as Int32Array;
    const seedHits = new Int32Array(count);
    let seedTotal = 0;
    for (let i = 0; i < n; i += 1) {
      if (seed[i] !== 1) continue;
      seedTotal += 1;
      const label = l[i] as number;
      if (label > 0) seedHits[label] = (seedHits[label] as number) + 1;
    }

    const keep = new Uint8Array(count);
    let covered = 0;
    for (let label = 1; label < count; label += 1) {
      if ((seedHits[label] as number) >= seedTotal * MIN_COMPONENT_SEED_SHARE) {
        keep[label] = 1;
        covered += seedHits[label] as number;
      }
    }
    const seedCoverage = seedTotal === 0 ? 0 : covered / seedTotal;
    if (Number.isNaN(grayRef) || grayRef < SHEET_MIN_PAPER_GRAY || seedCoverage < SHEET_MIN_SEED_COVERAGE) {
      return { mask: fallbackMask(rect, valid), method: 'fallback', seedCoverage, paperGray: grayRef };
    }

    // The target itself and the reference annulus are on the sheet by definition, which also closes
    // the region around the target when a printed ring line cuts the paper next to it.
    const unionPx = outerPx + SHEET_SEED_OUTER_MM * pxPerMm;
    const region = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) {
      if (keep[l[i] as number] === 1 || (radius[i] as number) <= unionPx) region[i] = 1;
    }
    const filled = fillEnclosed(region, side);

    const filledMat = track(new cv.Mat(side, side, cv.CV_8UC1));
    const f = filledMat.data as Uint8Array;
    for (let i = 0; i < n; i += 1) f[i] = filled[i] === 1 ? 255 : 0;
    const eroded = track(new cv.Mat());
    const erodePx = oddPx(2 * SHEET_ERODE_MM, pxPerMm);
    const erodeKernel = track(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(erodePx, erodePx)));
    cv.erode(filledMat, eroded, erodeKernel);

    const e = eroded.data as Uint8Array;
    const capPx = SHEET_SEARCH_CAP_MM * pxPerMm;
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) {
      if (e[i] !== 0 && valid[i] !== 0 && (radius[i] as number) <= capPx) mask[i] = 1;
    }
    return { mask, method: 'segmented', seedCoverage, paperGray: grayRef };
  } finally {
    for (const mat of mats) mat.delete();
  }
}
