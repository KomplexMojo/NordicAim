// backing-sheet.md §4, §4a, §5 (REV-38). A coloured sheet behind the target shows through every hole
// and through nothing else, because the target itself is printed in black on white paper. This module
// measures that colour (from a card photo, or from the target photo itself) and finds the holes by it.
// Pure over `RgbaImage` and OpenCV Mats; no DOM, no clock, no randomness.
//
//   §4   `backingColourFromCard` — the circular hue statistics of a photographed card
//   §4   `estimateBackingColour` — the same statistics measured off a target photo, with no card
//   §4a  `detectBackingPresence` — is a coloured backing present in THIS photo? (the `Auto` mode)
//   §5   `detectByBackingColour`  — the holes, as merged coloured blobs in target mm

import type { DetectionRecord } from '@/lib/domain/analysis';
import type { BackingMode, ColourSignature } from '@/lib/domain/backing';
import type { TemplateId } from '@/lib/domain/enums';
import type { CalibrationLike } from '@/lib/geometry/transform';
import type { RgbaImage } from '@/lib/media/format';
import type { CappableShot } from '@/lib/scoring/cap-shots';

import { AUTO_MAX_BLOB_RATIO, AUTO_MIN_CHROMA, AUTO_MIN_SPOTS } from './constants';
import { detectShotCandidates, shotsFromReport, type ShotCandidate } from './holes';
import { equivalentDiameterMm } from './multiplicity';
import type { OpenCv } from './opencv';
import { outerRadiusMm } from './rectify';
import { suggestShots } from './suggestions';

import type { BackingBlob, BackingColourReport } from './backing-blobs';
import { rgbToHsv, signatureFrom } from './backing-hue';
import { chromaMask, detectByBackingColour, reportFromView, withBackingView } from './backing-view';

export { rgbToHsv, hueDelta, hueDistance, hueStatistics, backingColourFromCard, whiteBalanceGains } from './backing-hue';
export type { Hsv } from './backing-hue';
export type { BackingBlob, BackingRule, BackingColourReport, BackingDetectOptions } from './backing-blobs';
export { detectByBackingColour } from './backing-view';

/**
 * backing-sheet.md §5.4: each merged blob is one shot with `multiplicity: 1` (REV-28 still holds).
 * Ids are `auto-1 …` in ascending radial order, as A5's standard path numbers them. The colour path
 * scores no confidence, so it reports none — but it does carry the blob's coloured area (§5.4), which
 * is what REV-28's cap ranks colour-path shots by when there are more than the declared rounds
 * (§5.7; `capShots` falls back to the radial distance only when neither is known).
 */
export function backingBlobsToShots(blobs: BackingBlob[]): CappableShot[] {
  return blobs.map((blob, index) => ({
    id: `auto-${index + 1}`,
    xMm: blob.xMm,
    yMm: blob.yMm,
    multiplicity: 1,
    positionOverrides: null,
    source: 'auto' as const,
    confidence: null,
    cluster: false,
    possibleOverlap: blob.possibleOverlap,
    // REV-39 (M20): reconciliation's double-punch evidence, stored on the shot.
    overlapRatio: blob.overlapRatio,
    areaMm2: blob.areaMm2,
  }));
}

export interface BackingPresence {
  present: boolean;
  spots: number;
  largestRatio: number;
  /** M19 Open question 1: the fluorescence and radial measurements (see {@link BackingColourReport}). */
  maxChroma: number;
  acceptedRadiusP10Mm: number | null;
  /** Why `Auto` said no, or null when it said present. */
  reason: string | null;
}

/**
 * `Auto`'s verdict from a neutral-chroma probe. Checked in this order, so the recorded reason names
 * the first rule that failed: a coloured area far bigger than a hole, too few spots (§4a), nothing
 * fluorescent (the chroma floor), or the colour lying outside the rings (the radial rule). The last
 * two are the owner's ruling on M19 Open question 1: they fail differently — the floor catches a
 * bright board, the radial rule a dull one — so both apply.
 */
function autoRefusal(probe: BackingColourReport, template: TemplateId): string | null {
  if (probe.largestRatio > AUTO_MAX_BLOB_RATIO) return AUTO_LARGE_AREA_REASON;
  if (probe.spots < AUTO_MIN_SPOTS) return AUTO_NO_SPOTS_REASON;
  if ((probe.maxChroma ?? 0) < AUTO_MIN_CHROMA) return AUTO_DULL_COLOUR_REASON;
  if (probe.acceptedRadiusP10Mm === null || probe.acceptedRadiusP10Mm > outerRadiusMm(template)) {
    return AUTO_OUTSIDE_RINGS_REASON;
  }
  return null;
}

/**
 * backing-sheet.md §4a (`Auto`), matching {@link detectShotsWithBacking}'s own decision:
 *
 * - With a known signature (`colour` not null): present whenever that colour's own blobs are found at
 *   all. Owner finding, 2026-09-26: the size/chroma/radius guards below exist to protect the colour-blind
 *   probe from confusing other non-neutral printed content (e.g. red ring numerals) with backing; they
 *   do not apply once a specific known hue is being matched, so a big or small blob of the right colour
 *   is trusted rather than refused.
 * - With no known signature (`colour` null): present when there are at least {@link AUTO_MIN_SPOTS}
 *   coloured blobs and none is more than {@link AUTO_MAX_BLOB_RATIO} times a hole's area — a coloured
 *   area far bigger than a hole is scenery, a backing board or a sticker in frame, not a hole — and, per
 *   M19 Open question 1, the colour is fluorescent ({@link AUTO_MIN_CHROMA}) and sits where holes can be
 *   (the accepted pixels' radius p10 inside the template's outermost circle).
 *
 * The spec writes this as `detectBackingPresence(img, calibration)`; the template and the calibre are
 * needed to rectify and to size a hole, exactly as A5 needs them (see the milestone's Open questions).
 */
export function detectBackingPresence(
  cv: OpenCv,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
  holeDiameterMm: number,
  colour: ColourSignature | null = null,
): BackingPresence {
  const report = detectByBackingColour(cv, img, calibration, template, holeDiameterMm, colour);
  const reason = colour !== null ? (report.blobs.length > 0 ? null : AUTO_NO_SPOTS_REASON) : autoRefusal(report, template);
  return {
    present: reason === null,
    spots: report.spots,
    largestRatio: report.largestRatio,
    maxChroma: report.maxChroma ?? 0,
    acceptedRadiusP10Mm: report.acceptedRadiusP10Mm,
    reason,
  };
}

/**
 * backing-sheet.md §4, "without a card": the backing's colour measured off a target photo instead of
 * a card, by taking the hue statistics of the pixels the neutral-chroma rule accepts inside the
 * searched sheet area. Returns `null` when nothing there is clearly coloured. This is what a
 * `BackingSheet` with `source: 'estimated'` carries; the detection path itself does not need it (§5
 * uses the chroma rule directly when there is no card), and `pnpm cv:eval` reports it as the colour
 * signature a backed photo shows.
 */
export function estimateBackingColour(
  cv: OpenCv,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
): ColourSignature | null {
  return withBackingView(cv, img, calibration, template, ({ rgb, searchable }) => {
    const { mask } = chromaMask(rgb, searchable);
    const hues: number[] = [];
    const sats: number[] = [];
    const vals: number[] = [];
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] !== 1) continue;
      const hsv = rgbToHsv(rgb[i * 3] as number, rgb[i * 3 + 1] as number, rgb[i * 3 + 2] as number);
      hues.push(hsv.hueDeg);
      sats.push(hsv.sat);
      vals.push(hsv.val);
    }
    return signatureFrom(hues, sats, vals);
  });
}

// --- A5's branch (analysis-pipeline §2 A5, backing-sheet.md §5) ----------------------------------

/** §4a: why `Auto` decided a photo is not backed. */
export const AUTO_LARGE_AREA_REASON = 'large coloured area';
/** §4a: the other way `Auto` says no — fewer than {@link AUTO_MIN_SPOTS} coloured blobs. */
export const AUTO_NO_SPOTS_REASON = 'no coloured spots';
/** M19 Open question 1: the colour is not fluorescent enough to be a backing sheet ({@link AUTO_MIN_CHROMA}). */
export const AUTO_DULL_COLOUR_REASON = 'colour too dull for a backing';
/** M19 Open question 1: the colour lies outside the rings — the board or scenery, not the holes. */
export const AUTO_OUTSIDE_RINGS_REASON = 'colour outside the rings';
/** §5.6: the colour path ran and found nothing, so the standard detector ran instead. */
export const COLOUR_NOT_FOUND_REASON = 'no backing colour showed through';

/**
 * §5.6: the colour path was chosen for this photo but found nothing, so the standard detector ran —
 * exactly the case that carries the `backing-colour-not-found` warning.
 */
export function usedBackingFallback(detection: DetectionRecord): boolean {
  return detection.method === 'standard' && (detection.backing === 'forced' || detection.backing === 'detected');
}

export interface BackingShotsResult {
  /** Colour-path shots carry the blob's coloured area (§5.4); the standard path carries confidence. */
  shots: CappableShot[];
  detection: DetectionRecord;
  /**
   * M21 step 1 (REV-40): the discarded candidates worth offering in Adjust. Derived — never stored or
   * scored. The colour path has no discarded candidates, so it offers none (M21 Open questions).
   */
  suggestions: ShotCandidate[];
  /** M21 step 3 (REV-41): each detected hole's measured width, for Adjust's double-punch prompt. */
  holeWidths: HoleWidth[];
}

/** M21 step 3: one detected hole's position, measured width, and measured area, in target mm. */
export interface HoleWidth {
  xMm: number;
  yMm: number;
  widthMm: number;
  /** Owner finding, 2026-09-26: the double-punch prompt reads this, not `widthMm` (see multiplicity.ts). */
  areaMm2: number;
}

/**
 * analysis-pipeline §2 (A5) with the coloured backing (backing-sheet.md §5). `none` never uses
 * colour, `coloured` always does, and `auto` asks §4a per photo. Whichever path runs, the shots come
 * back in target mm with `multiplicity: 1` (REV-28); capping to the declared rounds is Stage A's job.
 */
export function detectShotsWithBacking(
  cv: OpenCv,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
  holeDiameterMm: number,
  backing: { mode: BackingMode; colour: ColourSignature | null },
): BackingShotsResult {
  const standard = (record: DetectionRecord): BackingShotsResult => {
    const found = detectShotCandidates(cv, img, calibration, template, holeDiameterMm);
    return {
      shots: shotsFromReport(found),
      detection: record,
      suggestions: suggestShots(found.rejected, holeDiameterMm),
      // M21 Open questions: the standard path's blob is not a hole measurement (on the owner's labelled
      // holes 66% of real single holes read wider than 5.6 mm + 5% by area, 94% by major axis), so it
      // offers no width and no double-punch prompt. M20 found the same for its area ratio.
      holeWidths: [],
    };
  };

  if (backing.mode === 'none') {
    return standard({ method: 'standard', backing: 'off', fallbackReason: null });
  }

  let state: 'forced' | 'detected';
  let report: BackingColourReport;
  if (backing.mode === 'coloured') {
    state = 'forced';
    report = detectByBackingColour(cv, img, calibration, template, holeDiameterMm, backing.colour);
  } else if (backing.colour !== null) {
    // Owner finding, 2026-09-26: with a known signature on file, ask "does THIS colour show up" (the
    // hue rule) rather than "does ANY colour show up" (the neutral-chroma probe below). The chroma
    // probe cannot tell a lime backing from other non-neutral printed content on the sheet (this
    // template's red ring numerals, measured to read as colourful as the backing itself), which was
    // rejecting good detection outright on prints where those numerals are large or vivid. The
    // AUTO_MAX_BLOB_RATIO/AUTO_MIN_CHROMA/AUTO_RADIUS_QUANTILE guards below exist to protect the
    // colour-blind probe from exactly that confusion; they do not apply once we are matching a specific
    // known hue, so a big blob of the right colour is trusted as a real (likely multi-shot) cluster
    // rather than refused as "probably not backing." `report.blobs.length === 0` below still falls back
    // to the standard path when the known colour genuinely does not show up in this photo.
    state = 'detected';
    report = detectByBackingColour(cv, img, calibration, template, holeDiameterMm, backing.colour);
  } else {
    // §4a: with no known signature at all, the only option is the neutral-chroma probe.
    const decision = withBackingView(cv, img, calibration, template, (view) => {
      const probe = reportFromView(cv, view, holeDiameterMm, null);
      const reason = autoRefusal(probe, template);
      return reason !== null ? { present: false as const, reason } : { present: true as const, report: probe };
    });
    if (!decision.present) {
      return standard({ method: 'standard', backing: 'not-detected', fallbackReason: decision.reason });
    }
    state = 'detected';
    report = decision.report;
  }

  // §5.6: zero blobs means the colour told us nothing, so the standard detector runs instead.
  if (report.blobs.length === 0) {
    return standard({ method: 'standard', backing: state, fallbackReason: COLOUR_NOT_FOUND_REASON });
  }
  return {
    shots: backingBlobsToShots(report.blobs),
    detection: { method: 'colour', backing: state, fallbackReason: null },
    suggestions: [],
    // M21 step 3: the coloured area is the opening itself (§5.4), so its equivalent disc is the width.
    holeWidths: report.blobs.map((b) => ({ xMm: b.xMm, yMm: b.yMm, widthMm: equivalentDiameterMm(b.areaMm2), areaMm2: b.areaMm2 })),
  };
}
