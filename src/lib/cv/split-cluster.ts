// M11 step 6 / analysis-pipeline §2 (A5). Splits the pixels of a merged or torn hole cluster into
// `k` shot positions with k-means, so M13's Adjust screen can turn one blob into k shots. Pure: it
// takes and returns plain mm points; no DOM.

import type { OpenCv } from './opencv';

export interface PointMm {
  xMm: number;
  yMm: number;
}

/** M11 step 6: `cv.kmeans` with 5 attempts and `KMEANS_PP_CENTERS`. */
export const KMEANS_ATTEMPTS = 5;
const KMEANS_MAX_ITER = 20;
const KMEANS_EPSILON = 1e-4;

function meanOf(points: PointMm[]): PointMm {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.xMm;
    y += p.yMm;
  }
  return { xMm: x / points.length, yMm: y / points.length };
}

/** k-means centres come back in an arbitrary order; sorting makes the result reproducible. */
function byPosition(a: PointMm, b: PointMm): number {
  return a.xMm - b.xMm || a.yMm - b.yMm;
}

/**
 * M11 step 6. Returns `k` centroids in mm for the given cluster points.
 *
 * `k` is clamped to `1 .. pointsMm.length`: k-means cannot produce more centres than it has
 * samples, and a caller asking for one centre wants the plain mean.
 */
export function splitCluster(cv: OpenCv, pointsMm: PointMm[], k: number): PointMm[] {
  const n = pointsMm.length;
  if (n === 0) return [];

  const clusters = Math.min(Math.max(1, Math.round(k)), n);
  if (clusters === 1) return [meanOf(pointsMm)];
  if (clusters === n) return pointsMm.map((p) => ({ ...p })).sort(byPosition);

  const flat: number[] = [];
  for (const p of pointsMm) flat.push(p.xMm, p.yMm);

  const data = cv.matFromArray(n, 2, cv.CV_32F, flat);
  const labels = new cv.Mat();
  const centers = new cv.Mat();
  const criteria = new cv.TermCriteria(
    cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER,
    KMEANS_MAX_ITER,
    KMEANS_EPSILON,
  );

  try {
    cv.kmeans(data, clusters, labels, criteria, KMEANS_ATTEMPTS, cv.KMEANS_PP_CENTERS, centers);
    const values = centers.data32F as Float32Array;
    const out: PointMm[] = [];
    for (let i = 0; i < clusters; i += 1) {
      out.push({ xMm: (values[i * 2] as number) ?? 0, yMm: (values[i * 2 + 1] as number) ?? 0 });
    }
    return out.sort(byPosition);
  } finally {
    data.delete();
    labels.delete();
    centers.delete();
  }
}
