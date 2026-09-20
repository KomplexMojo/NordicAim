// M17 step 2 (REV-30). The analysis diagram positioned in IMAGE pixels, so it can be laid over the
// photo it was computed from and wiped against it.
//
// Every mm -> px conversion goes through `mmToPx` (geometry-scoring §2.1), and the printed circles
// come from `templateRingPolylines` — the same module M13's `ImageStage` draws its rings with — so
// this file introduces no ring, colour or scale constant of its own. Colours are the M05 palette
// (rendering-composite §1); the ring/shot/ellipse/MPI set is rendering-composite §3 items 5-8.
//
// Pure: no DOM, no `Date.now()`, no randomness.

import { BIATHLON_50M } from '../defaults/biathlon';
import type { AnalysisResult, GroupEllipse, Shot } from '../domain/analysis';
import type { TemplateId } from '../domain/enums';
import { RING_POLYLINE_POINTS, polylineAttr, templateRingPolylines, type RingPolyline } from '../geometry/rings';
import { mmToPx, type CalibrationLike } from '../geometry/transform';

import { PALETTE } from './palette';
import { el, num } from './svg';

export interface OverlayImageSize {
  widthPx: number;
  heightPx: number;
}

export interface OverlayShotMarker {
  id: string;
  /** Image px. */
  x: number;
  y: number;
  /** Semi-major / semi-minor radius in image px: the hole mapped through the calibration ellipse. */
  rx: number;
  ry: number;
  /** Image-space rotation of the marker, degrees clockwise from image +x (`Calibration.angleDeg`). */
  angleDeg: number;
  multiplicity: number;
}

export interface DiagramOverlayLayout {
  width: number;
  height: number;
  rings: RingPolyline[];
  shots: OverlayShotMarker[];
  /** The `all` subset's group ellipse, sampled in image px (null when there is no group). */
  groupEllipse: Array<{ x: number; y: number }> | null;
  /** The `all` subset's MPI in image px (null when there are no shots). */
  mpi: { x: number; y: number } | null;
  /** Cross arm length in image px for the MPI marker (display size only). */
  mpiArmPx: number;
}

/** rendering-composite §3 item 7: a shot with `multiplicity > 1` is drawn 1.25x. */
const MULTI_SHOT_SCALE = 1.25;
/** Display size only: the MPI cross arms, as a multiple of the hole marker's radius. */
const MPI_ARM_PER_MARKER_RADIUS = 2.5;

/** px per mm along the calibration's major axis (geometry-scoring §2). */
function scaleOf(cal: CalibrationLike): number {
  return cal.radiusPx / (cal.anchorDiameterMm / 2);
}

/**
 * The group ellipse, sampled as a closed polyline in image px. An ellipse in mm does not stay an
 * ellipse of the same axes under the calibration's own rotate-and-compress map, so it is sampled
 * through `mmToPx` exactly as the rings are rather than being approximated by an `<ellipse>`.
 */
export function groupEllipsePolyline(
  ellipse: GroupEllipse,
  cal: CalibrationLike,
  steps: number = RING_POLYLINE_POINTS,
): Array<{ x: number; y: number }> {
  const theta = (ellipse.angleDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (2 * Math.PI * i) / steps;
    // Target space (+y up): the ellipse's own frame rotated anticlockwise by `angleDeg`.
    const a = ellipse.rxMm * Math.cos(t);
    const b = ellipse.ryMm * Math.sin(t);
    points.push(
      mmToPx({ xMm: ellipse.cxMm + a * cosT - b * sinT, yMm: ellipse.cyMm + a * sinT + b * cosT }, cal),
    );
  }
  return points;
}

/**
 * M17 step 2: the diagram's rings, shots, group ellipse and MPI in image pixels.
 *
 * `holeDiameterMm` sizes the shot markers only (the profile default when omitted); it never moves a
 * marker, which always sits exactly at `mmToPx(shot, calibration)`.
 */
export function diagramOverlayLayout(
  result: AnalysisResult | null,
  shots: Shot[],
  calibration: CalibrationLike,
  template: TemplateId,
  imageSize: OverlayImageSize,
  holeDiameterMm: number = BIATHLON_50M.holeDiameterMm,
): DiagramOverlayLayout {
  const scale = scaleOf(calibration);
  const markerRadius = (holeDiameterMm / 2) * scale;
  const subset = result?.all ?? null;
  return {
    width: imageSize.widthPx,
    height: imageSize.heightPx,
    rings: templateRingPolylines(calibration, template),
    shots: shots.map((shot) => {
      const point = mmToPx(shot, calibration);
      const r = shot.multiplicity > 1 ? markerRadius * MULTI_SHOT_SCALE : markerRadius;
      return {
        id: shot.id,
        x: point.x,
        y: point.y,
        rx: r,
        ry: r * calibration.axisRatio,
        angleDeg: calibration.angleDeg,
        multiplicity: shot.multiplicity,
      };
    }),
    groupEllipse:
      subset?.groupEllipse == null ? null : groupEllipsePolyline(subset.groupEllipse, calibration),
    mpi: subset?.mpi == null ? null : mmToPx(subset.mpi, calibration),
    mpiArmPx: markerRadius * MPI_ARM_PER_MARKER_RADIUS,
  };
}

/**
 * A ring drawn over a photo has to be legible on whatever it lies on: inside the aiming mark the
 * paper is dark, outside it is white. rendering-composite §3 item 5 makes the same split by ring
 * number; here the anchor's own diameter is the boundary, which works for both templates.
 */
function ringStroke(ring: RingPolyline, anchorDiameterMm: number): string {
  if (ring.style === 'guide') return PALETTE.guideOnDark;
  return ring.diameterMm > anchorDiameterMm ? PALETTE.ringOnLight : PALETTE.ringOnDark;
}

/**
 * M17 step 2 / REV-30: the same diagram the results screen shows, drawn in the photo's own pixel
 * space so the two can be compared. Strokes use `vector-effect="non-scaling-stroke"`, so the widths
 * below are on-screen pixels at whatever size the SVG is displayed.
 */
export function renderDiagramOverlaySvg(
  result: AnalysisResult | null,
  shots: Shot[],
  calibration: CalibrationLike,
  template: TemplateId,
  imageSize: OverlayImageSize,
  holeDiameterMm: number = BIATHLON_50M.holeDiameterMm,
): string {
  const layout = diagramOverlayLayout(result, shots, calibration, template, imageSize, holeDiameterMm);
  const stroke = { 'vector-effect': 'non-scaling-stroke', fill: 'none' } as const;

  const rings = layout.rings
    .map((ring) =>
      el('polygon', {
        ...stroke,
        class: 'overlay-ring',
        'data-diameter-mm': String(ring.diameterMm),
        points: polylineAttr(ring.points),
        stroke: ringStroke(ring, calibration.anchorDiameterMm),
        'stroke-width': ring.style === 'anchor' ? 2.5 : 1.5,
        'stroke-dasharray': ring.style === 'guide' ? '6 6' : undefined,
      }),
    )
    .join('');

  const ellipse =
    layout.groupEllipse === null
      ? ''
      : el('polygon', {
          ...stroke,
          class: 'overlay-group-ellipse',
          points: polylineAttr(layout.groupEllipse),
          stroke: PALETTE.ellipse,
          'stroke-width': 2,
        });

  const shotMarkers = layout.shots
    .map((marker) =>
      el('ellipse', {
        class: 'overlay-shot',
        'data-shot-id': marker.id,
        cx: marker.x,
        cy: marker.y,
        rx: marker.rx,
        ry: marker.ry,
        transform: `rotate(${num(marker.angleDeg)} ${num(marker.x)} ${num(marker.y)})`,
        fill: 'none',
        stroke: PALETTE.shotProne,
        'stroke-width': 2,
        'vector-effect': 'non-scaling-stroke',
      }),
    )
    .join('');

  const mpi =
    layout.mpi === null
      ? ''
      : el(
          'g',
          { class: 'overlay-mpi', stroke: PALETTE.mpi, 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke' },
          el('line', {
            x1: layout.mpi.x - layout.mpiArmPx,
            y1: layout.mpi.y,
            x2: layout.mpi.x + layout.mpiArmPx,
            y2: layout.mpi.y,
          }) +
            el('line', {
              x1: layout.mpi.x,
              y1: layout.mpi.y - layout.mpiArmPx,
              x2: layout.mpi.x,
              y2: layout.mpi.y + layout.mpiArmPx,
            }),
        );

  return el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${num(layout.width)} ${num(layout.height)}`,
      width: layout.width,
      height: layout.height,
      class: 'diagram-overlay',
    },
    rings + ellipse + shotMarkers + mpi,
  );
}

// --- The compare sliders' own arithmetic (M17 step 3, REV-30, REV-85) -----------------------------

export interface BlendLayerStyle {
  /** CSS `clip-path` for the diagram layer. */
  clipPath: string;
  /** CSS `opacity` for the diagram layer. */
  opacity: number;
  /** Where the swipe boundary sits, as a fraction of the box from its left edge. */
  boundaryFraction: number;
}

function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * REV-85: two independent sliders over the diagram layer. **Swipe** runs 0 (the whole diagram) to 1 (the whole photo): the layer keeps
 * the left `1 - swipe` of the box. **Fade** runs 0 (the diagram solid) to 1 (the diagram gone): the layer's opacity is `1 - fade`. Both
 * apply at once, so a half-swiped diagram can also be half-transparent.
 */
export function blendLayerStyle(fade: number, swipe: number): BlendLayerStyle {
  const f = unit(fade);
  const w = unit(swipe);
  return { clipPath: `inset(0 ${num(w * 100)}% 0 0)`, opacity: 1 - f, boundaryFraction: 1 - w };
}
