// geometry-scoring.md §2.1. Pure mm<->px transforms and calibration scaling. No DOM.

import type { Calibration } from '../domain/photo';

/**
 * Only the fields the transform math needs; a full Calibration satisfies this structurally.
 * `perspective` is optional here so callers that only ever describe a square-on disc (the capture
 * overlay, test fixtures) need not spell it out: absent and `null` mean the same thing.
 */
export type CalibrationLike = Pick<Calibration, 'cx' | 'cy' | 'radiusPx' | 'axisRatio' | 'angleDeg' | 'anchorDiameterMm'> & {
  perspective?: Calibration['perspective'] | undefined;
};

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** px per mm along the calibration's major axis. */
function scaleOf(cal: CalibrationLike): number {
  return cal.radiusPx / (cal.anchorDiameterMm / 2);
}

/**
 * Target space (mm, origin at target centre, +x right, +y up) -> image space (px, origin top-left,
 * +x right, +y down). geometry-scoring.md §2.1.
 *
 * Step 0 (REV-44, M18): when the calibration carries a `perspective`, the point is first divided by
 * `w = p·xMm + q·yMm + 1`, then goes through the ellipse map below. With `perspective` null (or
 * absent) step 0 is skipped, so the result is bit-for-bit the pre-M18 one.
 */
export function mmToPx(point: { xMm: number; yMm: number }, cal: CalibrationLike): { x: number; y: number } {
  const perspective = cal.perspective ?? null;
  let p = point;
  if (perspective !== null) {
    const w = perspective.p * point.xMm + perspective.q * point.yMm + 1;
    p = { xMm: point.xMm / w, yMm: point.yMm / w };
  }
  const s = scaleOf(cal);
  const theta = toRadians(cal.angleDeg);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // 1. flip y into image orientation
  const u = p.xMm * s;
  const v = -p.yMm * s;

  // 2. rotate into the ellipse frame, then compress the minor axis
  const uPrime = u * cosT + v * sinT;
  let vPrime = -u * sinT + v * cosT;
  vPrime *= cal.axisRatio;

  // 3. rotate back and translate to the calibration centre
  const x = cal.cx + uPrime * cosT - vPrime * sinT;
  const y = cal.cy + uPrime * sinT + vPrime * cosT;
  return { x, y };
}

/** Exact inverse of {@link mmToPx}. geometry-scoring.md §2.1. */
export function pxToMm(p: { x: number; y: number }, cal: CalibrationLike): { xMm: number; yMm: number } {
  const s = scaleOf(cal);
  const theta = toRadians(cal.angleDeg);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // undo step 3 (rotate the translated point by -theta)
  const dx = p.x - cal.cx;
  const dy = p.y - cal.cy;
  const uPrime = dx * cosT + dy * sinT;
  const vPrimeCompressed = -dx * sinT + dy * cosT;

  // undo the minor-axis compression, then undo the rotation into the ellipse frame
  const vPrime = vPrimeCompressed / cal.axisRatio;
  const u = uPrime * cosT - vPrime * sinT;
  const v = uPrime * sinT + vPrime * cosT;

  // undo step 1 (divide by scale, flip y back)
  const xMm = u / s;
  const yMm = -v / s;

  // undo step 0: X' = X / w with w = pX + qY + 1, so 1/w = 1 - pX' - qY' and X = X' / (1 - pX' - qY').
  const perspective = cal.perspective ?? null;
  if (perspective === null) return { xMm, yMm };
  const inverseW = 1 - perspective.p * xMm - perspective.q * yMm;
  return { xMm: xMm / inverseW, yMm: yMm / inverseW };
}

/**
 * capture-overlay.md §3.3. Multiplies cx, cy and radiusPx by `factor`; every other field is carried
 * through unchanged — including `perspective`, which is in target mm and so does not change when the
 * image is rescaled (the homography's last row is invariant under `diag(f, f, 1)`).
 */
export function scaleCalibration<T extends { cx: number; cy: number; radiusPx: number }>(cal: T, factor: number): T {
  return { ...cal, cx: cal.cx * factor, cy: cal.cy * factor, radiusPx: cal.radiusPx * factor };
}
