// Issue #65 (REV-144): whether an alignment agrees with the printed sheet's corner markers. Pure.

import type { SheetMarker } from '@/lib/cv/sheet-markers';
import { markerCornersMm } from '@/lib/cv/sheet-markers';

import { mmToPxH } from './homography';
import { homographyFromPoints } from './point-homography';
import { mmToPx, type CalibrationLike } from './transform';

/**
 * How far apart the two alignments put the target, beyond which the photo is flagged. Measured on the owner's four printed-sheet
 * photos (2026-09-30): the markers and the ring fit differed by at most 4.7 mm anywhere on the disc edge, because the sheet bows on
 * its clipboard. A ring fit locked onto the wrong circle is off by tens of millimetres.
 */
export const MARKER_DISAGREE_MM = 8;

/**
 * The largest distance, in mm, between where the calibration and the markers put the target's centre and points on its anchor disc
 * edge. Null with fewer than two markers: one marker's four corners fix too small a patch of the sheet to judge the disc by.
 */
export function markerAlignmentGapMm(markers: readonly Pick<SheetMarker, 'corner' | 'corners'>[], cal: CalibrationLike): number | null {
  if (markers.length < 2) return null;
  const pairs = markers.flatMap((m) => markerCornersMm(m.corner).map((mm, i) => ({ mm, px: m.corners[i]! })));
  const h = homographyFromPoints(pairs);
  if (h === null) return null;
  const toMarkersPx = (xMm: number, yMm: number) => mmToPxH({ xMm, yMm }, h);
  // Local scale of the markers' model at the centre, to express a pixel gap in millimetres.
  const o = toMarkersPx(0, 0);
  const e = toMarkersPx(1, 0);
  const pxPerMm = Math.hypot(e.x - o.x, e.y - o.y);
  if (!(pxPerMm > 0)) return null;
  const r = cal.anchorDiameterMm / 2;
  const points = [{ xMm: 0, yMm: 0 }, ...Array.from({ length: 16 }, (_, k) => ({ xMm: r * Math.cos((k * Math.PI) / 8), yMm: r * Math.sin((k * Math.PI) / 8) }))];
  let worst = 0;
  for (const p of points) {
    const a = mmToPx(p, cal);
    const b = toMarkersPx(p.xMm, p.yMm);
    worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y) / pxPerMm);
  }
  return worst;
}
