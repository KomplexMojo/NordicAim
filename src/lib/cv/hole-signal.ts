// M16 R1 (REV-34). The polarity-free hole signal. A hole on the black aiming mark may be darker than,
// brighter than or as bright as the ink around it, and the two kinds sit side by side in one photo, so
// nothing here asks which way a pixel differs — only whether it differs from its local background.
//
//   deviation  |gray - background| > K x (the surface's median |gray - background|)
//   share      the fraction of a hole-sized disc that deviates (M11's area gate, read locally)
//   peaks      local maxima of the lightly smoothed share, at least one hole radius apart
//
// Pure over OpenCV Mats; no DOM.

import {
  HOLE_BACKGROUND_DIAMETERS,
  HOLE_DEVIATION_FLOOR,
  HOLE_DEVIATION_K,
  HOLE_PEAK_SIGMA_FRACTION,
  HOLE_SCORE_MIN,
} from './constants';
import type { CvMat, OpenCv } from './opencv';
import type { Rectified } from './rectify';

/** Pixel surfaces: the black aiming mark (inside the anchor radius) and the paper around it. */
export const SURFACE_NONE = 0;
export const SURFACE_MARK = 1;
export const SURFACE_PAPER = 2;

/** A disc footprint must see at least this share of searchable pixels to score. */
const MIN_FOOTPRINT_COVER = 0.5;

export interface HoleSignal {
  /** 1 where a pixel deviates from its background. */
  deviates: Uint8Array;
  /** The local background (median), per pixel. */
  background: Uint8Array;
  /** Share of the hole disc around each pixel that deviates; 0 where it does not score. */
  share: Float32Array;
  /** SURFACE_* per pixel. */
  surface: Uint8Array;
  peaks: Array<{ x: number; y: number; share: number }>;
}

function histogramMedian(histogram: Int32Array, count: number): number {
  let cumulative = 0;
  for (let v = 0; v < histogram.length; v += 1) {
    cumulative += histogram[v] as number;
    if (cumulative * 2 >= count) return v;
  }
  return histogram.length - 1;
}

function discKernel(cv: OpenCv, radiusPx: number): { kernel: CvMat; area: number } {
  const size = 2 * Math.ceil(radiusPx) + 1;
  const kernel = cv.Mat.zeros(size, size, cv.CV_32F);
  const k = kernel.data32F as Float32Array;
  const mid = size >> 1;
  let area = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (Math.hypot(x - mid, y - mid) > radiusPx) continue;
      k[y * size + x] = 1;
      area += 1;
    }
  }
  return { kernel, area };
}

/**
 * R1 over the rectified square. `searchable` is 1 where a pixel may take part: on the sheet (R3) and
 * off every printed circle (R2). `anchorRadiusMm` splits the two surfaces, whose backgrounds are
 * measured separately so the edge of the black mark is never read as a hole.
 */
export function holeSignal(
  cv: OpenCv,
  rect: Rectified,
  searchable: Uint8Array,
  anchorRadiusMm: number,
  holeDiameterMm: number,
): HoleSignal {
  const { side, pxPerMm } = rect;
  const n = side * side;
  const centre = side / 2;
  const gray = rect.gray.data as Uint8Array;
  const holeRadiusPx = (holeDiameterMm / 2) * pxPerMm;
  const anchorPx = anchorRadiusMm * pxPerMm;

  const surface = new Uint8Array(n);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      surface[y * side + x] = Math.hypot(x - centre, y - centre) <= anchorPx ? SURFACE_MARK : SURFACE_PAPER;
    }
  }

  const background = new Uint8Array(n);
  const deviates = new Uint8Array(n);
  const window = Math.round(HOLE_BACKGROUND_DIAMETERS * 2 * holeRadiusPx) | 1;
  for (const cls of [SURFACE_MARK, SURFACE_PAPER]) {
    // Before the median filter, pixels that are not this surface's searchable ground are painted
    // over: the other surface with the local mean of this surface's ground (so a window straddling the
    // mark's edge sees this surface at its local level, even under a shadow), and this surface's own
    // printed bands and off-sheet pixels with its median. Measured on the labelled holes, painting
    // everything with the local mean instead cost 5 points of recall and 11 of precision.
    const histogram = new Int32Array(256);
    let count = 0;
    for (let i = 0; i < n; i += 1) {
      if (searchable[i] !== 1 || surface[i] !== cls) continue;
      histogram[gray[i] as number] = (histogram[gray[i] as number] as number) + 1;
      count += 1;
    }
    if (count === 0) continue;
    const surfaceMedian = histogramMedian(histogram, count);
    const src = new cv.Mat(side, side, cv.CV_8UC1);
    const out = new cv.Mat();
    const weighted = cv.Mat.zeros(side, side, cv.CV_32F);
    const weights = cv.Mat.zeros(side, side, cv.CV_32F);
    const weightedMean = new cv.Mat();
    const weightMean = new cv.Mat();
    try {
      const wv = weighted.data32F as Float32Array;
      const ww = weights.data32F as Float32Array;
      for (let i = 0; i < n; i += 1) {
        if (searchable[i] !== 1 || surface[i] !== cls) continue;
        wv[i] = gray[i] as number;
        ww[i] = 1;
      }
      const box = new cv.Size(window, window);
      cv.blur(weighted, weightedMean, box);
      cv.blur(weights, weightMean, box);
      const wm = weightedMean.data32F as Float32Array;
      const mm = weightMean.data32F as Float32Array;
      const s = src.data as Uint8Array;
      for (let i = 0; i < n; i += 1) {
        if (surface[i] === cls) s[i] = searchable[i] === 1 ? (gray[i] as number) : surfaceMedian;
        else s[i] = (mm[i] as number) > 1e-3 ? Math.round((wm[i] as number) / (mm[i] as number)) : surfaceMedian;
      }
      cv.medianBlur(src, out, window);
      const o = out.data as Uint8Array;
      const deviations = new Int32Array(256);
      for (let i = 0; i < n; i += 1) {
        if (surface[i] !== cls) continue;
        background[i] = o[i] as number;
        if (searchable[i] !== 1) continue;
        const d = Math.abs((gray[i] as number) - (o[i] as number));
        deviations[d] = (deviations[d] as number) + 1;
      }
      const cut = HOLE_DEVIATION_K * Math.max(HOLE_DEVIATION_FLOOR, histogramMedian(deviations, count));
      for (let i = 0; i < n; i += 1) {
        if (surface[i] !== cls || searchable[i] !== 1) continue;
        if (Math.abs((gray[i] as number) - (background[i] as number)) > cut) deviates[i] = 1;
      }
    } finally {
      for (const mat of [src, out, weighted, weights, weightedMean, weightMean]) mat.delete();
    }
  }

  const share = new Float32Array(n);
  const peaks: HoleSignal['peaks'] = [];
  const devMat = cv.Mat.zeros(side, side, cv.CV_32F);
  const searchMat = cv.Mat.zeros(side, side, cv.CV_32F);
  const devSum = new cv.Mat();
  const searchSum = new cv.Mat();
  const shareMat = new cv.Mat(side, side, cv.CV_32F);
  const smooth = new cv.Mat();
  const dilated = new cv.Mat();
  const { kernel, area } = discKernel(cv, holeRadiusPx);
  const peakKernel = cv.getStructuringElement(
    cv.MORPH_ELLIPSE,
    new cv.Size(2 * Math.round(holeRadiusPx) + 1, 2 * Math.round(holeRadiusPx) + 1),
  );
  try {
    const dm = devMat.data32F as Float32Array;
    const sm = searchMat.data32F as Float32Array;
    for (let i = 0; i < n; i += 1) {
      if (searchable[i] !== 1) continue;
      sm[i] = 1;
      if (deviates[i] === 1) dm[i] = 1;
    }
    const anchor = new cv.Point(-1, -1);
    cv.filter2D(devMat, devSum, cv.CV_32F, kernel, anchor, 0, cv.BORDER_CONSTANT);
    cv.filter2D(searchMat, searchSum, cv.CV_32F, kernel, anchor, 0, cv.BORDER_CONSTANT);
    const ds = devSum.data32F as Float32Array;
    const ss = searchSum.data32F as Float32Array;
    const sh = shareMat.data32F as Float32Array;
    for (let i = 0; i < n; i += 1) {
      const value = searchable[i] === 1 && (ss[i] as number) >= MIN_FOOTPRINT_COVER * area ? (ds[i] as number) / (ss[i] as number) : 0;
      share[i] = value;
      sh[i] = value;
    }

    const sigma = HOLE_PEAK_SIGMA_FRACTION * holeRadiusPx;
    const size = 2 * Math.ceil(3 * sigma) + 1;
    cv.GaussianBlur(shareMat, smooth, new cv.Size(size, size), sigma);
    cv.dilate(smooth, dilated, peakKernel);
    const sv = smooth.data32F as Float32Array;
    const dv = dilated.data32F as Float32Array;
    const raw: Array<{ x: number; y: number; share: number; smooth: number }> = [];
    for (let i = 0; i < n; i += 1) {
      if ((share[i] as number) < HOLE_SCORE_MIN || (sv[i] as number) <= 0 || (sv[i] as number) < (dv[i] as number)) continue;
      raw.push({ x: i % side, y: (i / side) | 0, share: share[i] as number, smooth: sv[i] as number });
    }
    // Plateaus give several equal maxima: keep the strongest, then any at least one hole radius away.
    raw.sort((a, b) => b.smooth - a.smooth || a.y - b.y || a.x - b.x);
    for (const p of raw) {
      if (peaks.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < holeRadiusPx)) continue;
      peaks.push({ x: p.x, y: p.y, share: p.share });
    }
  } finally {
    for (const mat of [devMat, searchMat, devSum, searchSum, shareMat, smooth, dilated, kernel, peakKernel]) mat.delete();
  }

  return { deviates, background, share, surface, peaks };
}
