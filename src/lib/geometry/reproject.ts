// analysis-pipeline §8 (REV-46). A shot is where its hole is in the photo; its millimetre position is
// derived through the alignment. So when the alignment changes, the rings move and the holes do not:
// every shot is re-projected to keep its place in the image, and its score then follows the corrected rings.

import type { Shot } from '@/lib/domain/analysis';

import { type CalibrationLike, mmToPx, pxToMm } from './transform';

/**
 * REV-46: how far two millimetre positions may differ and still be the same position. Far below any
 * drag a person can make, far above the floating-point drift of re-projecting through many small
 * alignment changes one after another.
 */
export const REPROJECT_TOLERANCE_MM = 1e-6;

/** Moves each shot's millimetre position so it stays on the same image pixel under `to` as under `from`. */
export function reprojectShots(shots: Shot[], from: CalibrationLike, to: CalibrationLike): Shot[] {
  return shots.map((shot) => {
    const mm = pxToMm(mmToPx({ xMm: shot.xMm, yMm: shot.yMm }, from), to);
    return { ...shot, xMm: mm.xMm, yMm: mm.yMm };
  });
}

/** Whether two millimetre positions are the same within `REPROJECT_TOLERANCE_MM`. */
export function samePositionMm(a: { xMm: number; yMm: number }, b: { xMm: number; yMm: number }): boolean {
  return Math.abs(a.xMm - b.xMm) <= REPROJECT_TOLERANCE_MM && Math.abs(a.yMm - b.yMm) <= REPROJECT_TOLERANCE_MM;
}
