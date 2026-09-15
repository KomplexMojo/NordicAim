// geometry-scoring.md §2.1. Pure mm<->px transforms and calibration scaling. No DOM.

import type { Calibration } from '../domain/photo';

/** Only the fields the transform math needs; a full Calibration satisfies this structurally. */
export type CalibrationLike = Pick<Calibration, 'cx' | 'cy' | 'radiusPx' | 'axisRatio' | 'angleDeg' | 'anchorDiameterMm'>;

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
 */
export function mmToPx(p: { xMm: number; yMm: number }, cal: CalibrationLike): { x: number; y: number } {
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
  return { xMm, yMm };
}

/**
 * capture-overlay.md §3.3. Multiplies cx, cy and radiusPx by `factor`; every other field is carried
 * through unchanged.
 */
export function scaleCalibration<T extends { cx: number; cy: number; radiusPx: number }>(cal: T, factor: number): T {
  return { ...cal, cx: cal.cx * factor, cy: cal.cy * factor, radiusPx: cal.radiusPx * factor };
}
