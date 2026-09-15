// geometry-scoring.md §6. Group metrics over a subset of units.

import type { Angular, GroupEllipse, MpiOffset } from '../domain/analysis';

export type { Angular, GroupEllipse, MpiOffset };

export interface Point {
  xMm: number;
  yMm: number;
}

/** Undefined (null) when N = 0. */
export function mpi(units: Point[]): Point | null {
  if (units.length === 0) return null;
  const xMm = units.reduce((sum, u) => sum + u.xMm, 0) / units.length;
  const yMm = units.reduce((sum, u) => sum + u.yMm, 0) / units.length;
  return { xMm, yMm };
}

function coordKey(u: Point): string {
  return `${u.xMm}|${u.yMm}`;
}

/** Max Euclidean distance over all unit pairs. Undefined (null) when < 2 distinct coordinates. */
export function extremeSpread(units: Point[]): number | null {
  const distinct = new Set(units.map(coordKey));
  if (distinct.size < 2) return null;

  let max = 0;
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i]!;
      const b = units[j]!;
      const d = Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm);
      if (d > max) max = d;
    }
  }
  return max;
}

/** Mean distance of units from `center`. Undefined (null) when N = 0 or center is null. */
export function meanRadius(units: Point[], center: Point | null): number | null {
  if (units.length === 0 || center === null) return null;
  const total = units.reduce((sum, u) => sum + Math.hypot(u.xMm - center.xMm, u.yMm - center.yMm), 0);
  return total / units.length;
}

/**
 * 2-sigma population-covariance ellipse. Undefined (null) when N < 3, fewer than 3 distinct
 * coordinates, or fully degenerate (both eigenvalues 0). `ry = 0` alone is allowed.
 */
export function groupEllipse(units: Point[]): GroupEllipse | null {
  const distinct = new Set(units.map(coordKey));
  if (units.length < 3 || distinct.size < 3) return null;

  const n = units.length;
  const xbar = units.reduce((sum, u) => sum + u.xMm, 0) / n;
  const ybar = units.reduce((sum, u) => sum + u.yMm, 0) / n;

  let a = 0;
  let c = 0;
  let b = 0;
  for (const u of units) {
    const dx = u.xMm - xbar;
    const dy = u.yMm - ybar;
    a += dx * dx;
    c += dy * dy;
    b += dx * dy;
  }
  a /= n;
  c /= n;
  b /= n;

  const mid = (a + c) / 2;
  const half = (a - c) / 2;
  const spread = Math.sqrt(half * half + b * b);
  const lambda1 = mid + spread;
  const lambda2 = mid - spread;
  if (lambda1 === 0 && lambda2 === 0) return null;

  const rxMm = 2 * Math.sqrt(lambda1);
  const ryMm = 2 * Math.sqrt(Math.max(lambda2, 0));
  const rawAngleDeg = (0.5 * Math.atan2(2 * b, a - c) * 180) / Math.PI;
  const angleDeg = ((rawAngleDeg % 180) + 180) % 180;

  return { cxMm: xbar, cyMm: ybar, rxMm, ryMm, angleDeg };
}

/** `rad = 2*atan(sizeMm / (2*distanceMm))`. Undefined (null) when `sizeMm` is null. */
export function angular(sizeMm: number | null, distanceMm: number): Angular | null {
  if (sizeMm === null) return null;
  const rad = 2 * Math.atan(sizeMm / (2 * distanceMm));
  return { moa: rad * (180 / Math.PI) * 60, mrad: rad * 1000 };
}

/** Per-axis `rad = atan(mpi.axis / distanceMm)`. Undefined (null) when `center` is null. */
export function mpiOffset(center: Point | null, distanceMm: number): MpiOffset | null {
  if (center === null) return null;
  const xRad = Math.atan(center.xMm / distanceMm);
  const yRad = Math.atan(center.yMm / distanceMm);
  return {
    xMm: center.xMm,
    yMm: center.yMm,
    xMoa: xRad * (180 / Math.PI) * 60,
    yMoa: yRad * (180 / Math.PI) * 60,
    xMrad: xRad * 1000,
    yMrad: yRad * 1000,
  };
}
