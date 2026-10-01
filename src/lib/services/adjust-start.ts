// M13 / M17 step 1: where Adjust starts its alignment, how many declared rounds have no hole yet, and the ground-truth export.
// Split out of `services/adjust.ts` (issue #24); pure.

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '@/lib/defaults/templates';
import type { Shot, TargetAnalysis } from '@/lib/domain/analysis';
import { declaredRoundsOrNull } from '@/lib/domain/categorization';
import type { Calibration, Categorization, TargetPhoto } from '@/lib/domain/photo';
import { priorInWorkingPx } from '@/lib/pipeline/stage-a';

export interface GroundTruthExport {
  calibration: Calibration | null;
  shots: Shot[];
  imageSize: { widthPx: number; heightPx: number };
}

/**
 * M13 step 7. The ground-truth JSON the owner exports for a reference target: the calibration and the
 * shots as they stand, plus the working image's size so the calibration's pixels mean something. No
 * image data — see `fixtures/reference/ground-truth/README.md`.
 */
export function buildGroundTruth(photo: TargetPhoto, analysis: TargetAnalysis): GroundTruthExport {
  return {
    calibration: analysis.calibration,
    shots: analysis.shots,
    imageSize: { widthPx: photo.working.widthPx, heightPx: photo.working.heightPx },
  };
}

/** The fallback disc, as a fraction of the working image's short side, when there is nothing to start from. */
const FALLBACK_RADIUS_FRACTION = 0.35;

/**
 * What the Adjust screen starts from. A stored calibration wins; otherwise the capture overlay's
 * prior (scaled to working px, capture-overlay §3.3); otherwise a centred disc of the right anchor
 * size, so a photo whose target was never found (`target-not-found`) can still be lined up by hand.
 * The milestone does not state this fallback — see its Open questions.
 */
export function adjustStartCalibration(photo: TargetPhoto, analysis: TargetAnalysis): Calibration {
  if (analysis.calibration !== null) return analysis.calibration;
  const prior = priorInWorkingPx(photo);
  if (prior !== null) return prior;

  const template = photo.categorization.template ?? photo.capture?.overlayTemplate ?? 'precision';
  const { widthPx, heightPx } = photo.working;
  return {
    cx: widthPx / 2,
    cy: heightPx / 2,
    radiusPx: Math.min(widthPx, heightPx) * FALLBACK_RADIUS_FRACTION,
    axisRatio: 1,
    angleDeg: 0,
    anchorDiameterMm:
      template === 'sighting' ? SIGHTING_TEMPLATE.anchor.diameterMm : PRECISION_TEMPLATE.anchor.diameterMm,
    source: 'manual',
    confidence: null,
    perspective: null,
  };
}

/**
 * M17 step 1 (REV-29). The declared rounds that have no hole on the diagram yet:
 * `max(0, declaredRounds - identified units)`. This is what the Adjust screen parks in the tray as
 * draggable markers.
 *
 * Derived on every render and **never stored** — there is no field for it in the data model, and a
 * stored marker would be something Stage A could overwrite (analysis-pipeline §8). While the
 * categorization is incomplete there is no declared count, so nothing is unplaced.
 */
export function unplacedRounds(categorization: Categorization, shots: Shot[]): number {
  const declared = declaredRoundsOrNull(categorization);
  if (declared === null) return 0;
  const identified = shots.reduce((sum, shot) => sum + shot.multiplicity, 0);
  return Math.max(0, declared - identified);
}
