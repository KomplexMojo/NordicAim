// capture-overlay.md §3, §4. Pure math + SVG for the live template overlay and its calibration prior.
// No DOM: no `window`, `document`, or canvas.

import type { Calibration } from '../domain/photo';
import type { TemplateId } from '../domain/enums';

export type OverlayStyle = 'anchor' | 'ring' | 'guide';

/** capture-overlay.md §3.1. */
export function overlayCircles(template: TemplateId): {
  outerDiameterMm: number;
  anchorDiameterMm: number;
  circles: Array<{ diameterMm: number; style: OverlayStyle }>;
} {
  if (template === 'sighting') {
    return {
      outerDiameterMm: 115,
      anchorDiameterMm: 115,
      circles: [
        { diameterMm: 115, style: 'anchor' },
        { diameterMm: 110, style: 'guide' },
        { diameterMm: 45, style: 'ring' },
        { diameterMm: 40, style: 'guide' },
      ],
    };
  }
  return {
    outerDiameterMm: 154.4,
    anchorDiameterMm: 112.4,
    circles: [
      { diameterMm: 154.4, style: 'ring' },
      { diameterMm: 112.4, style: 'anchor' },
      { diameterMm: 74.4, style: 'ring' },
      { diameterMm: 42.4, style: 'ring' },
      { diameterMm: 10.4, style: 'ring' },
    ],
  };
}

// --- 3.2 Viewfinder transforms ---------------------------------------------------------------

export interface Size {
  w: number;
  h: number;
}

/** css = frame * k + o */
export interface FitTransform {
  k: number;
  ox: number;
  oy: number;
}

function fitTransform(container: Size, frame: Size, k: number): FitTransform {
  return {
    k,
    ox: (container.w - frame.w * k) / 2,
    oy: (container.h - frame.h * k) / 2,
  };
}

/** k = max(W/Vw, H/Vh) — fills the container, cropping the frame. Used for the live viewfinder. */
export function coverTransform(container: Size, frame: Size): FitTransform {
  const k = Math.max(container.w / frame.w, container.h / frame.h);
  return fitTransform(container, frame, k);
}

/** k = min(W/Vw, H/Vh) — fits the whole frame inside the container. Used for the review image. */
export function containTransform(container: Size, frame: Size): FitTransform {
  const k = Math.min(container.w / frame.w, container.h / frame.h);
  return fitTransform(container, frame, k);
}

export function cssToFrame(p: { x: number; y: number }, t: FitTransform): { x: number; y: number } {
  return { x: (p.x - t.ox) / t.k, y: (p.y - t.oy) / t.k };
}

export function frameToCss(p: { x: number; y: number }, t: FitTransform): { x: number; y: number } {
  return { x: p.x * t.k + t.ox, y: p.y * t.k + t.oy };
}

// --- 3.3 Layout and calibration prior ---------------------------------------------------------

export interface OverlayLayout {
  centerCss: { x: number; y: number };
  mmToCss: number;
  outerRadiusCss: number;
  anchorRadiusCss: number;
  circles: Array<{ rCss: number; style: OverlayStyle }>;
  maskHoleRadiusCss: number;
}

/**
 * capture-overlay.md §3.3. Centre is the container centre; the overlay's outer diameter is
 * `outerDiameterFraction` of the container's short side.
 */
export function overlayLayout(container: Size, template: TemplateId, outerDiameterFraction: number): OverlayLayout {
  if (outerDiameterFraction < 0.5 || outerDiameterFraction > 0.95) {
    throw new RangeError(`outerDiameterFraction must be within [0.5, 0.95], got ${outerDiameterFraction}`);
  }
  const spec = overlayCircles(template);
  const outerDiameterCss = outerDiameterFraction * Math.min(container.w, container.h);
  const outerRadiusCss = outerDiameterCss / 2;
  const mmToCss = outerDiameterCss / spec.outerDiameterMm;
  const anchorRadiusCss = (spec.anchorDiameterMm / 2) * mmToCss;
  return {
    centerCss: { x: container.w / 2, y: container.h / 2 },
    mmToCss,
    outerRadiusCss,
    anchorRadiusCss,
    circles: spec.circles.map((c) => ({ rCss: (c.diameterMm / 2) * mmToCss, style: c.style })),
    maskHoleRadiusCss: outerRadiusCss * 1.08,
  };
}

/**
 * capture-overlay.md §3.3. Converts the overlay (drawn in css space, over the cover-fit live
 * viewfinder) into a calibration prior in FRAME pixels.
 */
export function calibrationPriorFromOverlay(
  container: Size,
  frame: Size,
  template: TemplateId,
  outerDiameterFraction: number
): Calibration {
  const layout = overlayLayout(container, template, outerDiameterFraction);
  const cover = coverTransform(container, frame);
  const centre = cssToFrame(layout.centerCss, cover);
  const spec = overlayCircles(template);
  return {
    cx: centre.x,
    cy: centre.y,
    radiusPx: layout.anchorRadiusCss / cover.k,
    axisRatio: 1,
    angleDeg: 0,
    anchorDiameterMm: spec.anchorDiameterMm,
    source: 'overlay',
    confidence: null,
  };
}

// --- 4. Overlay rendering ----------------------------------------------------------------------

const HALO_COLOR = '#0B1220';
const LINE_COLOR = '#FFFFFF';

function styleAttrs(style: OverlayStyle): { haloWidth: number; lineWidth: number; opacity: number; dasharray: string | null } {
  switch (style) {
    case 'anchor':
      return { haloWidth: 5, lineWidth: 3, opacity: 0.9, dasharray: null };
    case 'ring':
      return { haloWidth: 3.5, lineWidth: 1.5, opacity: 0.8, dasharray: null };
    case 'guide':
      return { haloWidth: 3.5, lineWidth: 1.5, opacity: 0.7, dasharray: '6 6' };
  }
}

/** capture-overlay.md §4. Pure SVG string; `pointer-events: none`, viewBox `0 0 W H`. */
export function renderOverlaySvg(layout: OverlayLayout, template: TemplateId, size: Size): string {
  const { x: cx, y: cy } = layout.centerCss;
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.w} ${size.h}" style="pointer-events: none" data-overlay-template="${template}">`
  );

  // 1. Mask with a circular hole cut out via evenodd fill-rule.
  const holeR = layout.maskHoleRadiusCss;
  const maskD =
    `M0,0 H${size.w} V${size.h} H0 Z ` +
    `M${cx + holeR},${cy} ` +
    `A${holeR},${holeR} 0 1,0 ${cx - holeR},${cy} ` +
    `A${holeR},${holeR} 0 1,0 ${cx + holeR},${cy} Z`;
  parts.push(`<path class="overlay-mask" fill="rgba(8,12,18,0.35)" fill-rule="evenodd" d="${maskD}" />`);

  // 2. Each circle: halo, then the styled line.
  for (const circle of layout.circles) {
    const { haloWidth, lineWidth, opacity, dasharray } = styleAttrs(circle.style);
    parts.push(
      `<circle class="overlay-halo" cx="${cx}" cy="${cy}" r="${circle.rCss}" fill="none" stroke="${HALO_COLOR}" stroke-width="${haloWidth}" />`
    );
    const dash = dasharray ? ` stroke-dasharray="${dasharray}"` : '';
    parts.push(
      `<circle class="overlay-${circle.style}" cx="${cx}" cy="${cy}" r="${circle.rCss}" fill="none" stroke="${LINE_COLOR}" stroke-width="${lineWidth}" opacity="${opacity}"${dash} />`
    );
  }

  // 3. Centre cross: two white 1.5 px lines, half-length anchorRadiusCss * 0.15.
  const crossLen = layout.anchorRadiusCss * 0.15;
  parts.push(
    `<line class="overlay-cross" x1="${cx - crossLen}" y1="${cy}" x2="${cx + crossLen}" y2="${cy}" stroke="${LINE_COLOR}" stroke-width="1.5" />`
  );
  parts.push(
    `<line class="overlay-cross" x1="${cx}" y1="${cy - crossLen}" x2="${cx}" y2="${cy + crossLen}" stroke="${LINE_COLOR}" stroke-width="1.5" />`
  );

  // 4. Four 12 px outward ticks on the anchor circle at 0deg, 90deg, 180deg, 270deg.
  const ar = layout.anchorRadiusCss;
  const tickLen = 12;
  for (const deg of [0, 90, 180, 270]) {
    const theta = (deg * Math.PI) / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const x1 = cx + ar * cosT;
    const y1 = cy + ar * sinT;
    const x2 = cx + (ar + tickLen) * cosT;
    const y2 = cy + (ar + tickLen) * sinT;
    parts.push(
      `<line class="overlay-tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${LINE_COLOR}" stroke-width="2" />`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}
