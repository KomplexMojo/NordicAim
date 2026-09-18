// M18 Tests: a target sheet rendered under a KNOWN homography — a flat sheet photographed off-axis,
// which is what `tests/helpers/synthetic-target.ts` cannot draw (it maps every circle with the ellipse
// model, so its printed circles are concentric ellipses by construction and the question M18 asks
// cannot even arise).
//
// The sheet is a plane rotated by `tiltDeg` about the image x-axis at `distanceMm` from a pinhole
// camera, so the ground truth is exact: the printed centre is `H · (0, 0)` and every printed circle is
// the image of a circle of known radius. Each circle is drawn as a 256-point polygon, because SVG's
// own transforms are affine and cannot express perspective.

import type { TemplateId } from '@/lib/domain/enums';
import { mmToPxH, multiplyHomography, type Homography } from '@/lib/geometry/homography';
import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '@/lib/defaults/templates';
import type { RgbaImage } from '@/lib/media/format';

import { svgToRgba } from './rgba';
import { INK, LINE_MM, PAPER } from './synthetic-target';

export interface TiltedTargetSpec {
  template: TemplateId;
  width: number;
  height: number;
  /** Where the target centre lands in the image, in px. */
  cx: number;
  cy: number;
  /** Image scale at the target centre, in px per mm. */
  pxPerMm: number;
  /** Rotation of the sheet's plane away from the sensor, in degrees. 0 = square on. */
  tiltDeg: number;
  /** Camera distance to the target centre, in mm. Nearer = stronger perspective. */
  distanceMm: number;
  /** Direction the sheet tilts, as a rotation in the image plane. 0 = the top edge leans away. */
  rollDeg?: number;
}

/** Points per printed circle. Fine enough that the polygon is within ~0.01 mm of the true conic. */
const POLYGON_POINTS = 256;

/**
 * The exact mapping the sheet is drawn with: target mm (+y up) -> image px (+y down).
 *
 * A point `(X, Y)` on the sheet sits at `(X, Y cos t, Y sin t + D)` in camera coordinates once the
 * plane is tilted by `t` about the camera's x-axis, and a pinhole of focal length `f = pxPerMm * D`
 * projects it to `(f X / w, -f Y cos t / w)` with `w = Y sin t + D`. `rollDeg` then turns the whole
 * image so the tilt need not be vertical.
 */
export function tiltHomography(spec: TiltedTargetSpec): Homography {
  const t = (spec.tiltDeg * Math.PI) / 180;
  const f = spec.pxPerMm * spec.distanceMm;
  const projection: Homography = [f, 0, 0, 0, -f * Math.cos(t), 0, 0, Math.sin(t), spec.distanceMm];
  const roll = (spec.rollDeg ?? 0) * (Math.PI / 180);
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  const rotate: Homography = [c, -s, 0, s, c, 0, 0, 0, 1];
  const translate: Homography = [1, 0, spec.cx, 0, 1, spec.cy, 0, 0, 1];
  return multiplyHomography(translate, multiplyHomography(rotate, projection));
}

/** The image of the target centre — the point the printed rings really are concentric about. */
export function tiltedCentrePx(spec: TiltedTargetSpec): { x: number; y: number } {
  return mmToPxH({ xMm: 0, yMm: 0 }, tiltHomography(spec));
}

function circlePolygon(h: Homography, diameterMm: number): string {
  const r = diameterMm / 2;
  const points: string[] = [];
  for (let i = 0; i < POLYGON_POINTS; i += 1) {
    const angle = (2 * Math.PI * i) / POLYGON_POINTS;
    const p = mmToPxH({ xMm: r * Math.cos(angle), yMm: r * Math.sin(angle) }, h);
    points.push(`${p.x.toFixed(3)},${p.y.toFixed(3)}`);
  }
  return points.join(' ');
}

export function tiltedTargetSvg(spec: TiltedTargetSpec): string {
  const h = tiltHomography(spec);
  const lineWidth = Math.max(1, LINE_MM * spec.pxPerMm);
  const polygon = (diameterMm: number, attrs: string): string =>
    `<polygon points="${circlePolygon(h, diameterMm)}" ${attrs} />`;
  const line = (diameterMm: number, colour: string, dash?: string): string =>
    polygon(
      diameterMm,
      `fill="none" stroke="${colour}" stroke-width="${lineWidth}"${dash === undefined ? '' : ` stroke-dasharray="${dash}"`}`,
    );

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">`,
    `<rect x="0" y="0" width="${spec.width}" height="${spec.height}" fill="${PAPER}" />`,
  ];

  if (spec.template === 'precision') {
    for (const diameterMm of Object.values(PRECISION_TEMPLATE.ringDiameterMm)) {
      if (diameterMm > PRECISION_TEMPLATE.blackDiameterMm) parts.push(line(diameterMm, INK));
    }
    parts.push(polygon(PRECISION_TEMPLATE.blackDiameterMm, `fill="${INK}"`));
    for (const diameterMm of Object.values(PRECISION_TEMPLATE.ringDiameterMm)) {
      if (diameterMm <= PRECISION_TEMPLATE.blackDiameterMm) parts.push(line(diameterMm, PAPER));
    }
    parts.push(line(PRECISION_TEMPLATE.innerTenDiameterMm, PAPER));
  } else {
    const dash = `${(2 * spec.pxPerMm).toFixed(2)} ${(2 * spec.pxPerMm).toFixed(2)}`;
    parts.push(polygon(SIGHTING_TEMPLATE.anchor.diameterMm, `fill="${INK}"`));
    parts.push(line(SIGHTING_TEMPLATE.zones.standing.guideDiameterMm, PAPER, dash));
    parts.push(line(SIGHTING_TEMPLATE.zones.prone.solidDiameterMm, PAPER));
    parts.push(line(SIGHTING_TEMPLATE.zones.prone.guideDiameterMm, PAPER, dash));
    parts.push(line(SIGHTING_TEMPLATE.unscoredCircles[0]?.diameterMm ?? 15, PAPER));
  }

  parts.push('</svg>');
  return parts.join('');
}

export function tiltedTargetRgba(spec: TiltedTargetSpec): Promise<RgbaImage> {
  return svgToRgba(tiltedTargetSvg(spec));
}
