// Synthetic sighting/precision sheets for the CV unit tests and `scripts/cv-eval.ts` (M10).
// The sheet is drawn straight from a `Calibration`, so the calibration the test expects back is known
// exactly: every printed circle is an ellipse of diameter d mm with rx = (d/2) * scale,
// ry = rx * axisRatio, rotated by `angleDeg` clockwise (geometry-scoring §2).

import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';
import type { RgbaImage } from '@/lib/media/format';
import { ANCHOR_DIAMETER_MM } from '@/lib/cv/anchor';
import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '@/lib/defaults/templates';

import { svgToRgba } from './rgba';

const PAPER = '#F4F2EE';
const INK = '#181818';
const LINE_MM = 0.35;

export interface SyntheticTargetSpec {
  template: TemplateId;
  width: number;
  height: number;
  cx: number;
  cy: number;
  radiusPx: number;
  axisRatio: number;
  angleDeg: number;
}

/** The calibration the synthetic sheet was drawn with — the ground truth for a detection test. */
export function syntheticCalibration(spec: SyntheticTargetSpec): Calibration {
  return {
    cx: spec.cx,
    cy: spec.cy,
    radiusPx: spec.radiusPx,
    axisRatio: spec.axisRatio,
    angleDeg: spec.angleDeg,
    anchorDiameterMm: ANCHOR_DIAMETER_MM[spec.template],
    source: 'auto',
    confidence: null,
  };
}

export function syntheticTargetSvg(spec: SyntheticTargetSpec): string {
  const anchorMm = ANCHOR_DIAMETER_MM[spec.template];
  const pxPerMm = spec.radiusPx / (anchorMm / 2);
  const rotate = `rotate(${spec.angleDeg} ${spec.cx} ${spec.cy})`;
  const lineWidth = Math.max(1, LINE_MM * pxPerMm);

  function ellipse(diameterMm: number, attrs: string): string {
    const rx = (diameterMm / 2) * pxPerMm;
    const ry = rx * spec.axisRatio;
    return `<ellipse cx="${spec.cx}" cy="${spec.cy}" rx="${rx}" ry="${ry}" transform="${rotate}" ${attrs} />`;
  }

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">`,
    `<rect x="0" y="0" width="${spec.width}" height="${spec.height}" fill="${PAPER}" />`,
  ];

  if (spec.template === 'precision') {
    // Rings printed outside the black aiming mark are dark lines on paper; rings inside it are white.
    for (const [ring, diameterMm] of Object.entries(PRECISION_TEMPLATE.ringDiameterMm)) {
      if (diameterMm <= PRECISION_TEMPLATE.blackDiameterMm) continue;
      void ring;
      parts.push(ellipse(diameterMm, `fill="none" stroke="${INK}" stroke-width="${lineWidth}"`));
    }
    parts.push(ellipse(PRECISION_TEMPLATE.blackDiameterMm, `fill="${INK}"`));
    for (const diameterMm of Object.values(PRECISION_TEMPLATE.ringDiameterMm)) {
      if (diameterMm > PRECISION_TEMPLATE.blackDiameterMm) continue;
      parts.push(ellipse(diameterMm, `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}"`));
    }
    parts.push(ellipse(PRECISION_TEMPLATE.innerTenDiameterMm, `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}"`));
  } else {
    // On the real sheet (docs/reference/IMG_5057-sighting.jpg) every zone marking is a thin WHITE line
    // on the black disc: the disc itself stays solid, which is why it measures fill 0.962 against the
    // REV-26 guard. Drawing the prone zone as a filled white circle instead punches ~15% out of the
    // disc and drops it to 0.845, below the 0.85 guard.
    const dash = `${(2 * pxPerMm).toFixed(2)} ${(2 * pxPerMm).toFixed(2)}`;
    parts.push(ellipse(SIGHTING_TEMPLATE.anchor.diameterMm, `fill="${INK}"`));
    parts.push(
      ellipse(
        SIGHTING_TEMPLATE.zones.standing.guideDiameterMm,
        `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}" stroke-dasharray="${dash}"`,
      ),
    );
    parts.push(
      ellipse(SIGHTING_TEMPLATE.zones.prone.solidDiameterMm, `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}"`),
    );
    parts.push(
      ellipse(
        SIGHTING_TEMPLATE.zones.prone.guideDiameterMm,
        `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}" stroke-dasharray="${dash}"`,
      ),
    );
    const inner = SIGHTING_TEMPLATE.unscoredCircles[0]?.diameterMm ?? 15;
    parts.push(ellipse(inner, `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}"`));
  }

  parts.push('</svg>');
  return parts.join('');
}

export function syntheticTargetRgba(spec: SyntheticTargetSpec): Promise<RgbaImage> {
  return svgToRgba(syntheticTargetSvg(spec));
}

/**
 * REV-26 fixture: a precision sheet whose printed ring numbers all but touch the aiming mark, the way
 * they do on `IMG_5132-precision.jpg`. Two ink bars run from ring 1 inwards and stop `BRIDGE_GAP_PX`
 * short of the mark, so on the pre-CLOSE binary the mark is still its own component (as on the real
 * photo) while any CLOSE welds mark, rings and bars into one blob ~25% too large.
 */
const BRIDGE_GAP_PX = 6;
const BRIDGE_BAR_PX = 24;
const BRIDGE_RING_LINE_MM = 2.0;

export function bridgedPrecisionSvg(spec: SyntheticTargetSpec): string {
  const anchorMm = PRECISION_TEMPLATE.blackDiameterMm;
  const pxPerMm = spec.radiusPx / (anchorMm / 2);
  const ellipse = (diameterMm: number, attrs: string): string =>
    `<ellipse cx="${spec.cx}" cy="${spec.cy}" rx="${(diameterMm / 2) * pxPerMm}" ` +
    `ry="${(diameterMm / 2) * pxPerMm * spec.axisRatio}" ${attrs} />`;

  const outerRings = Object.values(PRECISION_TEMPLATE.ringDiameterMm)
    .filter((d) => d > anchorMm)
    .sort((a, b) => a - b);
  const ringLine = BRIDGE_RING_LINE_MM * pxPerMm;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">`,
    `<rect x="0" y="0" width="${spec.width}" height="${spec.height}" fill="${PAPER}" />`,
  ];
  for (const diameterMm of outerRings.slice(0, 2)) {
    parts.push(ellipse(diameterMm, `fill="none" stroke="${INK}" stroke-width="${ringLine}"`));
  }
  parts.push(ellipse(anchorMm, `fill="${INK}"`));
  for (const diameterMm of Object.values(PRECISION_TEMPLATE.ringDiameterMm)) {
    if (diameterMm > anchorMm) continue;
    parts.push(ellipse(diameterMm, `fill="none" stroke="${PAPER}" stroke-width="${LINE_MM * pxPerMm}"`));
  }

  const outermost = outerRings[1] ?? outerRings[0] ?? anchorMm;
  const reach = (outermost / 2) * pxPerMm * spec.axisRatio + ringLine;
  const discEdge = spec.radiusPx * spec.axisRatio;
  const barLength = reach - discEdge - BRIDGE_GAP_PX;
  const barX = spec.cx - BRIDGE_BAR_PX / 2;
  parts.push(`<rect x="${barX}" y="${spec.cy - reach}" width="${BRIDGE_BAR_PX}" height="${barLength}" fill="${INK}" />`);
  parts.push(
    `<rect x="${barX}" y="${spec.cy + discEdge + BRIDGE_GAP_PX}" width="${BRIDGE_BAR_PX}" height="${barLength}" fill="${INK}" />`,
  );
  parts.push('</svg>');
  return parts.join('');
}

export function bridgedPrecisionRgba(spec: SyntheticTargetSpec): Promise<RgbaImage> {
  return svgToRgba(bridgedPrecisionSvg(spec));
}

/** Blank paper: no disc at all, so `detectAnchor` must return null. */
export function blankPaperRgba(width: number, height: number): Promise<RgbaImage> {
  return svgToRgba(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect x="0" y="0" width="${width}" height="${height}" fill="${PAPER}" /></svg>`,
  );
}
