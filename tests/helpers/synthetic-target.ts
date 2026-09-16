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
    const dash = `${(2 * pxPerMm).toFixed(2)} ${(2 * pxPerMm).toFixed(2)}`;
    parts.push(ellipse(SIGHTING_TEMPLATE.anchor.diameterMm, `fill="${INK}"`));
    parts.push(
      ellipse(
        SIGHTING_TEMPLATE.zones.standing.guideDiameterMm,
        `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}" stroke-dasharray="${dash}"`,
      ),
    );
    parts.push(ellipse(SIGHTING_TEMPLATE.zones.prone.solidDiameterMm, `fill="${PAPER}"`));
    parts.push(
      ellipse(
        SIGHTING_TEMPLATE.zones.prone.guideDiameterMm,
        `fill="none" stroke="${INK}" stroke-width="${lineWidth}" stroke-dasharray="${dash}"`,
      ),
    );
    const inner = SIGHTING_TEMPLATE.unscoredCircles[0]?.diameterMm ?? 15;
    parts.push(ellipse(inner, `fill="none" stroke="${INK}" stroke-width="${lineWidth}"`));
  }

  parts.push('</svg>');
  return parts.join('');
}

export function syntheticTargetRgba(spec: SyntheticTargetSpec): Promise<RgbaImage> {
  return svgToRgba(syntheticTargetSvg(spec));
}

/** Blank paper: no disc at all, so `detectAnchor` must return null. */
export function blankPaperRgba(width: number, height: number): Promise<RgbaImage> {
  return svgToRgba(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect x="0" y="0" width="${width}" height="${height}" fill="${PAPER}" /></svg>`,
  );
}
