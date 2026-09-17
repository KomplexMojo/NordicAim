// M16 R5: one photo's review record — what the shipping detection path found, in working px, for the
// review page to draw. Node-only (called by `build.ts`); no image data leaves this function.

import { detectAnchor } from '../../src/lib/cv/anchor.ts';
import { detectShotCandidates } from '../../src/lib/cv/holes.ts';
import type { OpenCv } from '../../src/lib/cv/opencv.ts';
import { printedCircleRadiiMm } from '../../src/lib/cv/print-mask.ts';
import { sharpness } from '../../src/lib/cv/sharpness.ts';
import { hintTemplate } from '../../src/lib/cv/template-hint.ts';
import type { TemplateId } from '../../src/lib/domain/enums.ts';
import { mmToPx } from '../../src/lib/geometry/transform.ts';
import type { RgbaImage } from '../../src/lib/media/format.ts';

/** The app's working image size, which the owner's earlier labels are also in. */
export const WORKING_LONGEST = 1200;
const HOLE_DIAMETER_MM = 5.6;

function round(value: number, digits = 1): number {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

export interface ReviewPhoto {
  id: string;
  name: string;
  width: number;
  height: number;
  sharpness: number;
  anchor: { cx: number; cy: number; radiusPx: number; axisRatio: number; angleDeg: number; anchorDiameterMm: number; confidence: number | null } | null;
  template: TemplateId | null;
  templateConfidence: number | null;
  holeRadiusPx: number | null;
  radii: number[];
  candidates: Array<Record<string, number | string | boolean>>;
  rejected: Array<Record<string, number | string>>;
  sheet: { method: string; seedCoverage: number } | null;
  numeralRotation: { deg: number; strength: number; reliable: boolean } | null;
  ms: number;
}

export function reviewPhoto(cv: OpenCv, img: RgbaImage, name: string): ReviewPhoto {
  const t0 = performance.now();
  const base = {
    id: name.replace(/\.jpe?g$/i, '').replace(/\s+/g, '_'),
    name,
    width: img.width,
    height: img.height,
    sharpness: round(sharpness(cv, img)),
  };
  const detection = detectAnchor(cv, img, null, 'both');
  if (detection === null) {
    return {
      ...base,
      anchor: null,
      template: null,
      templateConfidence: null,
      holeRadiusPx: null,
      radii: [],
      candidates: [],
      rejected: [],
      sheet: null,
      numeralRotation: null,
      ms: Math.round(performance.now() - t0),
    };
  }

  const cal = detection.calibration;
  const hint = hintTemplate(cv, img, cal);
  const report = detectShotCandidates(cv, img, cal, hint.template, HOLE_DIAMETER_MM);
  const pxPerMm = cal.radiusPx / (cal.anchorDiameterMm / 2);

  const candidates = [...report.candidates]
    .sort((a, b) => b.confidence - a.confidence || a.radialMm - b.radialMm)
    .map((c, i) => {
      const p = mmToPx({ xMm: c.xMm, yMm: c.yMm }, cal);
      return {
        rank: i + 1,
        x: round(p.x),
        y: round(p.y),
        xMm: round(c.xMm),
        yMm: round(c.yMm),
        radialMm: round(c.radialMm),
        conf: round(c.confidence, 2),
        score: round(c.score, 2),
        surface: c.surface,
        areaMm2: round(c.areaMm2),
        elong: round(c.elongation, 2),
        strokeMm: round(c.strokeRadiusMm, 2),
        cluster: c.cluster,
      };
    });
  const rejected = report.rejected
    // Low-share print and noise are too many to draw; the page shows what a filter actually decided.
    .filter((r) => r.reason !== 'area')
    .map((r) => {
      const p = mmToPx({ xMm: r.xMm, yMm: r.yMm }, cal);
      return { x: round(p.x), y: round(p.y), reason: r.reason, radialMm: round(r.radialMm), score: round(r.score, 2), elong: round(r.elongation, 2), strokeMm: round(r.strokeRadiusMm, 2) };
    });

  return {
    ...base,
    anchor: {
      cx: round(cal.cx),
      cy: round(cal.cy),
      radiusPx: round(cal.radiusPx),
      axisRatio: round(cal.axisRatio, 3),
      angleDeg: round(cal.angleDeg),
      anchorDiameterMm: cal.anchorDiameterMm,
      confidence: cal.confidence === null ? null : round(cal.confidence, 2),
    },
    template: hint.template,
    templateConfidence: round(hint.confidence, 2),
    holeRadiusPx: round((HOLE_DIAMETER_MM / 2) * pxPerMm),
    radii: printedCircleRadiiMm(hint.template),
    candidates,
    rejected,
    sheet: { method: report.sheet.method, seedCoverage: round(report.sheet.seedCoverage, 2) },
    numeralRotation: report.numeralRotation === null
      ? null
      : { deg: round(report.numeralRotation.deg), strength: round(report.numeralRotation.strength, 2), reliable: report.numeralRotation.reliable },
    ms: Math.round(performance.now() - t0),
  };
}
