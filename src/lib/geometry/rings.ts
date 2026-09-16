// M13 step 1: the template's printed circles, drawn over the photo in image px. The calibration's
// anchor is an ellipse in the photo, so a circle in mm is not a circle in px — every ring is sampled
// as a closed 96-point polyline through `mmToPx` instead of being drawn as an SVG circle.
//
// The circle set per template is capture-overlay.md §3.1's (`overlayCircles`), so Adjust draws exactly
// the rings the capture overlay drew. Pure: no DOM.

import { overlayCircles, type OverlayStyle } from '../capture/overlay';
import type { TemplateId } from '../domain/enums';

import { mmToPx, type CalibrationLike } from './transform';

/** M13 step 1: "96-point polylines". */
export const RING_POLYLINE_POINTS = 96;

export interface RingPolyline {
  diameterMm: number;
  style: OverlayStyle;
  /** Closed polygon: `points[0]` follows `points[n-1]`; the first point is not repeated. */
  points: Array<{ x: number; y: number }>;
}

/**
 * One ring of `diameterMm`, sampled anticlockwise in target space (+x right, +y up) from 0°, and
 * mapped into image px with the calibration.
 */
export function ringPolyline(
  cal: CalibrationLike,
  diameterMm: number,
  steps: number = RING_POLYLINE_POINTS,
): Array<{ x: number; y: number }> {
  const r = diameterMm / 2;
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (2 * Math.PI * i) / steps;
    points.push(mmToPx({ xMm: r * Math.cos(angle), yMm: r * Math.sin(angle) }, cal));
  }
  return points;
}

/** Every circle capture-overlay §3.1 draws for `template`, as polylines in image px. */
export function templateRingPolylines(
  cal: CalibrationLike,
  template: TemplateId,
  steps: number = RING_POLYLINE_POINTS,
): RingPolyline[] {
  return overlayCircles(template).circles.map((circle) => ({
    diameterMm: circle.diameterMm,
    style: circle.style,
    points: ringPolyline(cal, circle.diameterMm, steps),
  }));
}

/** `points` as an SVG `points` attribute (used with `<polygon>`, which closes the path itself). */
export function polylineAttr(points: Array<{ x: number; y: number }>): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}
