// M16 R5: one photo's review record — what the shipping detection path found, in working px, for the
// review page to draw. Node-only (called by `build.ts`); no image data leaves this function.

import { detectAnchor } from '../../src/lib/cv/anchor.ts';
import { detectBackingPresence, detectByBackingColour } from '../../src/lib/cv/backing-colour.ts';
import { detectShotCandidates } from '../../src/lib/cv/holes.ts';
import type { OpenCv } from '../../src/lib/cv/opencv.ts';
import { printedCircleRadiiMm } from '../../src/lib/cv/print-mask.ts';
import { sharpness } from '../../src/lib/cv/sharpness.ts';
import { hintTemplate } from '../../src/lib/cv/template-hint.ts';
import { swatchCss, type ColourSignature } from '../../src/lib/domain/backing.ts';
import type { TemplateId } from '../../src/lib/domain/enums.ts';
import { DEFAULT_MAX_PLAUSIBLE_HOLES } from '../../src/lib/domain/settings.ts';
import { mmToPx } from '../../src/lib/geometry/transform.ts';
import type { RgbaImage } from '../../src/lib/media/format.ts';

/** The app's working image size, which the owner's earlier labels are also in. */
export const WORKING_LONGEST = 1200;
/**
 * The owner's calliper measurement of a single-shot hole, 2026-09-26: 3.1-3.5 mm, not the app's
 * `.22 LR` default of 5.6 mm (`src/lib/defaults/biathlon.ts`). Every hole-diameter-scaled parameter in
 * `holes.ts`/`hole-signal.ts` (peak spacing, background window, cluster area ratio, surround ring) was
 * being sized for a hole ~1.7x too large, which the review's own detection is investigating.
 */
const HOLE_DIAMETER_MM = 3.3;

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
  candidates: Array<Record<string, number | string | boolean | null>>;
  /** Owner instruction, 2026-09-26: more candidates than this on one target is a detector malfunction. */
  implausible: boolean;
  rejected: Array<Record<string, number | string>>;
  sheet: { method: string; seedCoverage: number } | null;
  numeralRotation: { deg: number; strength: number; reliable: boolean } | null;
  /** M19 (REV-38): which A5 path produced `candidates`, and what `Auto` saw. */
  detection: {
    method: 'colour' | 'standard';
    backing: 'detected' | 'not-detected' | 'forced' | 'off';
    spots: number;
    largestRatio: number;
    /** M19 Open question 1: the fluorescence floor's and the radial rule's inputs, and why `Auto` said no. */
    maxChroma: number;
    radiusP10Mm: number | null;
    autoReason: string | null;
    /** The card's hue as a CSS colour, so the page can draw the swatch. */
    swatch: string | null;
    hueDeg: number | null;
  } | null;
  ms: number;
}

/** M19: the session's backing, as `pnpm review:detection` supplies it per photo. */
export interface ReviewBacking {
  mode: 'auto' | 'none' | 'coloured';
  colour: ColourSignature | null;
}

export function reviewPhoto(
  cv: OpenCv,
  img: RgbaImage,
  name: string,
  backing: ReviewBacking = { mode: 'auto', colour: null },
): ReviewPhoto {
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
      implausible: false,
      rejected: [],
      sheet: null,
      numeralRotation: null,
      detection: null,
      ms: Math.round(performance.now() - t0),
    };
  }

  const cal = detection.calibration;
  const hint = hintTemplate(cv, img, cal);
  const report = detectShotCandidates(cv, img, cal, hint.template, HOLE_DIAMETER_MM);
  const pxPerMm = cal.radiusPx / (cal.anchorDiameterMm / 2);

  // M19 (backing-sheet.md §5): when the session uses a backing — or `Auto` finds one — the page shows
  // what the colour path found, because that is what A5 would store.
  const presence = detectBackingPresence(cv, img, cal, hint.template, HOLE_DIAMETER_MM);
  const useColour = backing.mode === 'coloured' || (backing.mode === 'auto' && presence.present);
  const colour = useColour ? detectByBackingColour(cv, img, cal, hint.template, HOLE_DIAMETER_MM, backing.colour) : null;
  const byColour = colour !== null && colour.blobs.length > 0;

  const standardCandidates = [...report.candidates]
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
        possibleOverlap: false,
      };
    });
  const colourCandidates = (colour?.blobs ?? []).map((b, i) => {
    const p = mmToPx({ xMm: b.xMm, yMm: b.yMm }, cal);
    return {
      rank: i + 1,
      x: round(p.x),
      y: round(p.y),
      xMm: round(b.xMm),
      yMm: round(b.yMm),
      radialMm: round(b.radialMm),
      conf: null,
      score: null,
      surface: 'backing colour',
      areaMm2: round(b.areaMm2),
      elong: null,
      strokeMm: null,
      cluster: false,
      possibleOverlap: b.possibleOverlap,
    };
  });
  const candidates = byColour ? colourCandidates : standardCandidates;
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
    implausible: candidates.length === 0 || candidates.length > DEFAULT_MAX_PLAUSIBLE_HOLES,
    rejected,
    sheet: { method: report.sheet.method, seedCoverage: round(report.sheet.seedCoverage, 2) },
    detection: {
      method: byColour ? 'colour' : 'standard',
      backing: backing.mode === 'none' ? 'off' : backing.mode === 'coloured' ? 'forced' : presence.present ? 'detected' : 'not-detected',
      spots: presence.spots,
      largestRatio: round(presence.largestRatio, 2),
      maxChroma: round(presence.maxChroma),
      radiusP10Mm: presence.acceptedRadiusP10Mm === null ? null : round(presence.acceptedRadiusP10Mm),
      autoReason: presence.reason,
      swatch: backing.colour === null ? null : swatchCss(backing.colour),
      hueDeg: backing.colour === null ? null : round(backing.colour.hueDeg, 1),
    },
    numeralRotation: report.numeralRotation === null
      ? null
      : { deg: round(report.numeralRotation.deg), strength: round(report.numeralRotation.strength, 2), reliable: report.numeralRotation.reliable },
    ms: Math.round(performance.now() - t0),
  };
}
