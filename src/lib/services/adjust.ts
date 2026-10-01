// data-model §7 and analysis-pipeline §8: the two services behind the Adjust screen.
//
// `saveAdjustments` writes what the user corrected — a calibration becomes `manual` (and the
// alignment method with it), every shot the user added or changed becomes `manual`, and untouched
// auto shots keep their `auto` source so Stage A's rules in §8 stay meaningful. `redetectShots` is
// the explicit re-run: it replaces the `auto` shots and keeps the `manual` ones. `reanalyze` (REV-46)
// saves what is on screen and then re-runs detection against it. All set `stageB: 'pending'` and
// notify, so the results screen refreshes itself.
//
// REV-46: a shot is where its hole is in the photo. When the alignment changes, shots are re-projected
// so they stay on their holes, and re-projection alone never counts as an edit.

import * as Comlink from 'comlink';
import type { Shot, TargetAnalysis } from '@/lib/domain/analysis';
import { withBackingColour } from '@/lib/domain/backing';
import { backingInputFromSettings } from '@/lib/domain/settings';
import { photoStatus } from '@/lib/domain/status';
import type { Calibration } from '@/lib/domain/photo';
import { reprojectShots } from '@/lib/geometry/reproject';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import { WorkingImageMissingError, shotTemplate } from '@/lib/pipeline/stage-a';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { photoWorkingKey } from '@/lib/store/blob-keys';
import { getBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord, putPhotoRecord } from '@/lib/store/photos-repo';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings } from '@/lib/store/settings-repo';
import type { CvWorkerApi } from '@/workers/cv-client';

import type { ServiceContext } from './context';
import { AnalysisNotFoundError, PhotoNotFoundError } from './photos';

import { markManualShots, sameHole, withUniqueIds } from './adjust-merge';

export { markManualShots, SAME_HOLE_DIAMETERS } from './adjust-merge';
export { buildGroundTruth, adjustStartCalibration, unplacedRounds } from './adjust-start';
export type { GroundTruthExport } from './adjust-start';

/** Only the part of the worker `redetectShots` needs, so tests (and Adjust) can stub it. */
export type DetectShotsApi = Pick<CvWorkerApi, 'detectShots'>;

export class NoCalibrationError extends Error {
  constructor(photoId: string) {
    super(`No calibration to detect shots against for photo: ${photoId}`);
    this.name = 'NoCalibrationError';
  }
}

export interface AdjustmentsPatch {
  calibration?: Calibration;
  shots?: Shot[];
}

/**
 * One transaction (data-model §7): re-read the records, apply `mutate`, set Stage B back to
 * `pending` (§8), recompute the photo's status, touch `session.updatedAt`. Then emit and notify.
 */
async function commitAdjustment(
  ctx: ServiceContext,
  photoId: string,
  mutate: (analysis: TargetAnalysis) => TargetAnalysis,
): Promise<TargetAnalysis> {
  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['sessions', 'photos', 'analyses'], 'readwrite');
  const photo = await getPhotoRecord(tx, photoId);
  const analysis = await getAnalysisRecord(tx, photoId);
  if (photo === null || analysis === null) {
    await tx.done;
    throw photo === null ? new PhotoNotFoundError(photoId) : new AnalysisNotFoundError(photoId);
  }

  const mutated = mutate(analysis);
  const next: TargetAnalysis = {
    ...mutated,
    pipeline: { ...mutated.pipeline, stageB: 'pending' },
    updatedAt: nowIso,
  };
  const { status, reasons } = photoStatus({
    categorization: photo.categorization,
    analysis: next,
    result: next.computed?.result ?? null,
  });

  await putAnalysisRecord(tx, next);
  await putPhotoRecord(tx, { ...photo, status, reasons });
  const session = await getSessionRecord(tx, photo.sessionId);
  if (session !== null) await putSessionRecord(tx, { ...session, updatedAt: nowIso });
  await tx.done;

  emitPipelineChanged({ sessionId: photo.sessionId, photoId });
  pipelineHooks.notify();
  return next;
}

/**
 * analysis-pipeline §8 / M13 step 4. Saves the Adjust screen's corrections: a calibration the user
 * touched is stored with `source: 'manual'` and `pipeline.alignment = { method: 'manual',
 * confidence: null }`, edited or added shots become `manual`, Stage B goes back to `pending`.
 *
 * Pass `calibration` only when the user actually changed it — a manual calibration stops Stage A from
 * ever re-aligning this photo (§8).
 */
export async function saveAdjustments(
  ctx: ServiceContext,
  photoId: string,
  patch: AdjustmentsPatch,
): Promise<TargetAnalysis> {
  return commitAdjustment(ctx, photoId, (analysis) => {
    // REV-46: a new alignment moves the rings, not the holes. Re-project the stored shots into it first,
    // so a shot that merely followed the re-alignment compares equal and keeps its `auto` source.
    const baseline =
      patch.calibration !== undefined && analysis.calibration !== null
        ? reprojectShots(analysis.shots, analysis.calibration, patch.calibration)
        : analysis.shots;
    return {
    ...analysis,
    calibration:
      patch.calibration === undefined
        ? analysis.calibration
        : { ...patch.calibration, source: 'manual' as const, confidence: null },
    shots: patch.shots === undefined ? baseline : markManualShots(baseline, patch.shots),
    pipeline: {
      ...analysis.pipeline,
      alignment:
        patch.calibration === undefined
          ? analysis.pipeline.alignment
          : { method: 'manual' as const, confidence: null },
      // analysis-pipeline §4 rule 8 / §8: `extra-candidates-dropped` asks the owner to confirm which capped
      // marks were kept, and saving shots in Adjust is that confirmation. Stage B's reconciliation raises
      // it again only if it actually drops shots on its next pass, so a real over-count is never hidden.
      // REV-144: a saved alignment is the owner's answer to `sheet-markers-disagree`.
      warnings: analysis.pipeline.warnings.filter(
        (w) =>
          !(patch.shots !== undefined && w === 'extra-candidates-dropped') &&
          !(patch.calibration !== undefined && w === 'sheet-markers-disagree'),
      ),
    },
    };
  });
}

/**
 * analysis-pipeline §8 / M13 step 5. The explicit "Re-detect shots": runs the worker's `detectShots`
 * with the calibration as it stands now, replaces the `auto` shots with what it found and keeps every
 * `manual` shot. Everything is prepared before the transaction (data-model §6).
 */
export async function redetectShots(
  ctx: ServiceContext,
  photoId: string,
  cvApi: DetectShotsApi,
): Promise<TargetAnalysis> {
  const photo = await getPhotoRecord(ctx.db, photoId);
  if (photo === null) throw new PhotoNotFoundError(photoId);
  const analysis = await getAnalysisRecord(ctx.db, photoId);
  if (analysis === null) throw new AnalysisNotFoundError(photoId);

  const calibration = analysis.calibration;
  if (calibration === null) throw new NoCalibrationError(photoId);

  const workingBlob = await getBlob(ctx.db, photoWorkingKey(photoId));
  if (workingBlob === null) throw new WorkingImageMissingError(photoId);
  const bytes = await workingBlob.arrayBuffer();
  const settings = await getSettings(ctx.db);

  const detected = await cvApi.detectShots(
    Comlink.transfer(bytes, [bytes]),
    calibration,
    shotTemplate(photo, analysis.pipeline.templateHint, calibration),
    settings.profileOverrides.holeDiameterMm,
    // backing-sheet.md §5 (REV-48): an explicit re-detect uses the Settings backing, like A5 does.
    backingInputFromSettings(settings),
  );

  const holeDiameterMm = settings.profileOverrides.holeDiameterMm;
  return commitAdjustment(ctx, photoId, (current) => {
    const kept = current.shots.filter((shot) => shot.source === 'manual');
    // REV-46: a detection within SAME_HOLE_DIAMETERS of a manual shot is the same hole; the user's shot wins.
    const fresh = detected.shots.filter((found) => !kept.some((mine) => sameHole(mine, found, holeDiameterMm)));
    return {
      ...current,
      shots: [...kept, ...withUniqueIds(fresh, kept)],
      pipeline: { ...current.pipeline, detection: withBackingColour(detected.detection, settings.backing) },
    };
  });
}

/**
 * REV-46 / analysis-pipeline §8: **Re-analyze**. Saves what is on screen exactly as Save does — so a moved
 * alignment becomes `manual` and the shots are re-projected onto it — then re-runs detection against that
 * saved alignment, keeping the user's manual shots and re-scoring. Nothing on screen is discarded.
 *
 * Two steps rather than one transaction on purpose: detection needs the worker, which may not run inside
 * an IndexedDB transaction (data-model §6), and the save must land first so detection reads it.
 */
export async function reanalyze(
  ctx: ServiceContext,
  photoId: string,
  patch: AdjustmentsPatch,
  cvApi: DetectShotsApi,
): Promise<TargetAnalysis> {
  await saveAdjustments(ctx, photoId, patch);
  return redetectShots(ctx, photoId, cvApi);
}
