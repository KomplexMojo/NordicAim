// M18 step 2. Fits the mm -> px mapping to points measured on the sheet's printed concentric circles.
//
// A homography from ONE circle is under-determined (M18 Pitfalls), so this takes points from several
// circles of known radius at once and minimises, in millimetres, how far each point lands from the
// radius it was measured on. The residual is therefore the quantity the owner sees: "the drawn ring
// is N mm off the printed ring".
//
// `affineOnly` fits the six affine parameters instead of eight, which is exactly "fit an ellipse to
// this circle" — the image of a circle under an affine map IS an ellipse — and is how the ellipse
// model is measured on the same points, for a like-for-like comparison.
//
// Pure math, no DOM, no `Date.now`/`Math.random`: the same points always give the same answer.

import {
  alignRotationGauge,
  invertHomography,
  multiplyHomography,
  mmToPxH,
  pxToMmH,
  type Homography,
} from './homography';

/** One measured point on the printed circle of radius `rMm`, in image px. */
export interface CirclePoint {
  x: number;
  y: number;
  rMm: number;
}

export interface CircleFitOptions {
  /** Fit the 6 affine parameters only (the ellipse model). Default false: all 8. */
  affineOnly?: boolean;
  maxIterations?: number;
  /** Down-weight points that do not fit (default true). False gives plain least squares. */
  robust?: boolean;
  /** Reweighting passes when `robust`. Default {@link DEFAULT_REWEIGHTS}. */
  reweights?: number;
}

export interface CircleFitResult {
  homography: Homography;
  /** Root-mean-square radial residual over the points the fit kept, in mm. */
  rmsMm: number;
  /** Largest absolute radial residual over those points, in mm. */
  maxMm: number;
  /** How many of the input points still carried weight at the end. */
  usedPoints: number;
  iterations: number;
  converged: boolean;
}

const DEFAULT_MAX_ITERATIONS = 120;
const STEP = 1e-6;
const LAMBDA_START = 1e-3;
const LAMBDA_MAX = 1e12;
const IMPROVEMENT_EPS = 1e-14;
const DEFAULT_REWEIGHTS = 3;
/** Tukey's biweight constant: the textbook 4.685 robust-scale multiple at which a point is ignored. */
const TUKEY_C = 4.685;

/**
 * The parameter vector, as the correction `G` applied in target space (`H = init · G`). `G` is the
 * identity at zero, so the ellipse model is always the starting point and every parameter is O(1):
 * the last row is divided by `scaleMm` (a characteristic radius) so the perspective terms, which are
 * per-millimetre, are not 4 orders of magnitude smaller than the rest.
 */
function correction(params: number[], scaleMm: number): Homography {
  const p = (i: number): number => params[i] ?? 0;
  return [1 + p(0), p(1), p(2), p(3), 1 + p(4), p(5), p(6) / scaleMm, p(7) / scaleMm, 1];
}

/** Gaussian elimination with partial pivoting, for the 6x6 or 8x8 normal equations. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] as number]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs((m[row] as number[])[col] as number) > Math.abs((m[pivot] as number[])[col] as number)) pivot = row;
    }
    const pivotRow = m[pivot] as number[];
    if (Math.abs(pivotRow[col] as number) < 1e-18) return null;
    m[pivot] = m[col] as number[];
    m[col] = pivotRow;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const target = m[row] as number[];
      const factor = (target[col] as number) / (pivotRow[col] as number);
      if (factor === 0) continue;
      for (let k = col; k <= n; k += 1) target[k] = (target[k] as number) - factor * (pivotRow[k] as number);
    }
  }
  return m.map((row, i) => (row[n] as number) / ((row[i] as number) || 1));
}

/**
 * Fits the mapping to `points`, starting from `init` (the ellipse calibration's homography).
 *
 * The returned homography is gauge-aligned to `init` (see `alignRotationGauge`): concentric circles
 * cannot see the sheet's own rotation, so without that step a refit could rotate every shot position
 * about the centre while fitting the rings exactly as well.
 */
export function fitCircleHomography(
  points: readonly CirclePoint[],
  init: Homography,
  options: CircleFitOptions = {},
): CircleFitResult {
  const paramCount = options.affineOnly === true ? 6 : 8;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const reweights = options.robust === false ? 0 : (options.reweights ?? DEFAULT_REWEIGHTS);
  if (points.length < paramCount) {
    throw new Error(`fitCircleHomography: ${points.length} points is fewer than the ${paramCount} parameters`);
  }

  // The points never move, so map them into the init's mm frame once; every iteration then only has
  // to undo the small correction `G`.
  const initInverse = invertHomography(init);
  const seeds = points.map((p) => pxToMmH(p, init, initInverse));
  const radii = points.map((p) => p.rMm);
  const scaleMm = Math.max(1, radii.reduce((sum, r) => sum + r, 0) / radii.length);

  const residuals = (params: number[]): number[] => {
    const inverse = invertHomography(correction(params, scaleMm));
    return seeds.map((seed, i) => {
      const w = inverse[6] * seed.xMm + inverse[7] * seed.yMm + inverse[8];
      const x = (inverse[0] * seed.xMm + inverse[1] * seed.yMm + inverse[2]) / w;
      const y = (inverse[3] * seed.xMm + inverse[4] * seed.yMm + inverse[5]) / w;
      return Math.hypot(x, y) - (radii[i] as number);
    });
  };

  /** Levenberg-Marquardt on the weighted residuals; `root` is sqrt of each point's weight. */
  function runLm(root: number[], from: number[]): { params: number[]; iterations: number; converged: boolean } {
    const weighted = (r: number[]): number[] => r.map((v, i) => v * (root[i] as number));
    const cost = (r: number[]): number => r.reduce((sum, v) => sum + v * v, 0);

    let params = [...from];
    let current = weighted(residuals(params));
    let currentCost = cost(current);
    let lambda = LAMBDA_START;
    let iterations = 0;
    let converged = false;

    for (; iterations < maxIterations; iterations += 1) {
      // Numeric Jacobian: 8 parameters at most, so a central difference per parameter is cheap and
      // avoids a hand-derived derivative that could silently disagree with `correction`.
      const jacobian: number[][] = [];
      for (let p = 0; p < paramCount; p += 1) {
        const up = [...params];
        const down = [...params];
        up[p] = (up[p] as number) + STEP;
        down[p] = (down[p] as number) - STEP;
        const ru = weighted(residuals(up));
        const rd = weighted(residuals(down));
        jacobian.push(ru.map((v, i) => (v - (rd[i] as number)) / (2 * STEP)));
      }

      const jtj: number[][] = [];
      const jtr: number[] = [];
      for (let a = 0; a < paramCount; a += 1) {
        const rowA = jacobian[a] as number[];
        const row: number[] = [];
        for (let b = 0; b < paramCount; b += 1) {
          const rowB = jacobian[b] as number[];
          let sum = 0;
          for (let i = 0; i < current.length; i += 1) sum += (rowA[i] as number) * (rowB[i] as number);
          row.push(sum);
        }
        jtj.push(row);
        let g = 0;
        for (let i = 0; i < current.length; i += 1) g += (rowA[i] as number) * (current[i] as number);
        jtr.push(-g);
      }

      let stepped = false;
      while (lambda <= LAMBDA_MAX) {
        // Marquardt's scaling: damping proportional to each parameter's own curvature, so parameters
        // of very different magnitude (a rotation vs a vanishing line) are damped comparably. It also
        // keeps the fit stable along the one direction concentric circles cannot see (their rotation
        // in their own plane), which `alignRotationGauge` then pins.
        const damped = jtj.map((row, i) => row.map((v, j) => (i === j ? v + lambda * Math.max(v, 1e-12) : v)));
        const delta = solve(damped, jtr);
        if (delta === null) {
          lambda *= 10;
          continue;
        }
        const next = params.map((v, i) => v + (delta[i] as number));
        const nextResiduals = weighted(residuals(next));
        const nextCost = cost(nextResiduals);
        if (Number.isFinite(nextCost) && nextCost < currentCost) {
          const improvement = (currentCost - nextCost) / Math.max(currentCost, Number.MIN_VALUE);
          params = next;
          current = nextResiduals;
          currentCost = nextCost;
          lambda = Math.max(lambda / 10, 1e-12);
          stepped = true;
          if (improvement < IMPROVEMENT_EPS) converged = true;
          break;
        }
        lambda *= 10;
      }
      if (!stepped) {
        converged = true;
        break;
      }
      if (converged) break;
    }
    return { params, iterations, converged };
  }

  let root = new Array<number>(points.length).fill(1);
  let run = runLm(root, new Array<number>(paramCount).fill(0));
  let iterations = run.iterations;

  // Iteratively reweighted least squares, Tukey's biweight. A ray that latched onto a shot hole, a
  // printed numeral or a glare edge instead of the ring line is a real and common failure on the
  // owner's photos; plain least squares lets a handful of them drag the whole model.
  for (let pass = 0; pass < reweights; pass += 1) {
    const r = residuals(run.params);
    const scale = robustScale(r);
    if (scale <= 0) break;
    const limit = TUKEY_C * scale;
    root = r.map((v) => {
      const u = v / limit;
      return Math.abs(u) >= 1 ? 0 : 1 - u * u;
    });
    if (root.filter((w) => w > 0).length < paramCount) break;
    run = runLm(root, run.params);
    iterations += run.iterations;
  }

  const fitted = multiplyHomography(init, correction(run.params, scaleMm));
  const homography = alignRotationGauge(fitted, init);
  const finalResiduals = residuals(run.params);
  const kept = finalResiduals.filter((_, i) => (root[i] as number) > 0);
  const used = kept.length === 0 ? finalResiduals : kept;
  return {
    homography,
    rmsMm: Math.sqrt(used.reduce((sum, v) => sum + v * v, 0) / used.length),
    maxMm: used.reduce((max, v) => Math.max(max, Math.abs(v)), 0),
    usedPoints: used.length,
    iterations,
    converged: run.converged,
  };
}

/** 1.4826 x the median absolute residual — the robust equivalent of a standard deviation. */
function robustScale(residuals: readonly number[]): number {
  const sorted = [...residuals].map(Math.abs).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const mad =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? (sorted[mid] as number)
        : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  return 1.4826 * mad;
}

/**
 * How far the model puts the circle of radius `rMm` from where it really is, in mm: the residual of
 * each measured point of that circle under `homography`. Reported at the centre AND at the anchor
 * edge (M18 Pitfalls: a better centre must not make the outer rings worse).
 */
export function radialErrorsMm(points: readonly CirclePoint[], homography: Homography): number[] {
  const inverse = invertHomography(homography);
  return points.map((p) => {
    const mm = pxToMmH(p, homography, inverse);
    return Math.hypot(mm.xMm, mm.yMm) - p.rMm;
  });
}

/** The image of the target centre under `homography`, in px. */
export function modelCentrePx(homography: Homography): { x: number; y: number } {
  return mmToPxH({ xMm: 0, yMm: 0 }, homography);
}
