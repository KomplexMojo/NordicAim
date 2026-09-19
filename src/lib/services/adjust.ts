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

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '@/lib/defaults/templates';
import type { Shot, TargetAnalysis } from '@/lib/domain/analysis';
import { declaredRoundsOrNull } from '@/lib/domain/categorization';
import { photoStatus } from '@/lib/domain/status';
import type { Calibration, Categorization, TargetPhoto } from '@/lib/domain/photo';
import { reprojectShots, samePositionMm } from '@/lib/geometry/reproject';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import { WorkingImageMissingError, priorInWorkingPx, shotTemplate } from '@/lib/pipeline/stage-a';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { photoWorkingKey } from '@/lib/store/blob-keys';
import { getBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord, putPhotoRecord } from '@/lib/store/photos-repo';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings } from '@/lib/store/settings-repo';
import type { CvWorkerApi } from '@/workers/cv-client';

import type { ServiceContext } from './context';
import { AnalysisNotFoundError, PhotoNotFoundError } from './photos';

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

function sameOverrides(a: Shot['positionOverrides'], b: Shot['positionOverrides']): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** Two shots are the same edit-wise when nothing the user can change differs. */
function unchanged(previous: Shot, next: Shot): boolean {
  return (
    samePositionMm(previous, next) &&
    previous.multiplicity === next.multiplicity &&
    previous.cluster === next.cluster &&
    sameOverrides(previous.positionOverrides, next.positionOverrides)
  );
}

/**
 * M13 step 4: "every shot added or modified → `source 'manual'`; untouched auto shots stay `auto`".
 * An untouched shot is returned exactly as it was stored, so neither its source nor its confidence
 * moves; anything new or edited becomes `manual` with no confidence.
 */
export function markManualShots(previous: Shot[], next: Shot[]): Shot[] {
  const before = new Map(previous.map((shot) => [shot.id, shot]));
  return next.map((shot) => {
    const stored = before.get(shot.id);
    if (stored !== undefined && unchanged(stored, shot)) return stored;
    return { ...shot, source: 'manual' as const, confidence: null };
  });
}

/**
 * REV-46: how close, in hole diameters, a detection must be to a manual shot to be the same hole. The same
 * tolerance M16 R4 uses to match detections to the owner's taps (MATCH_HOLE_DIAMETERS), because a tap is by
 * eye. Deliberately under one diameter: two genuinely overlapping holes sit 0.5-1 diameter apart, and
 * swallowing the second would drop a real shot.
 */
export const SAME_HOLE_DIAMETERS = 0.8;

function sameHole(a: Shot, b: Shot, holeDiameterMm: number): boolean {
  return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm) < SAME_HOLE_DIAMETERS * holeDiameterMm;
}

/** A detected shot whose id collides with a kept manual one is renamed, so ids stay unique. */
function withUniqueIds(shots: Shot[], taken: Shot[]): Shot[] {
  const used = new Set(taken.map((shot) => shot.id));
  return shots.map((shot) => {
    let id = shot.id;
    let n = 2;
    while (used.has(id)) {
      id = `${shot.id}-${n}`;
      n += 1;
    }
    used.add(id);
    return id === shot.id ? shot : { ...shot, id };
  });
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
  // backing-sheet.md §5: an explicit re-detect uses the session's backing, like A5 does.
  const session = await getSessionRecord(ctx.db, photo.sessionId);

  const detected = await cvApi.detectShots(
    Comlink.transfer(bytes, [bytes]),
    calibration,
    shotTemplate(photo, analysis.pipeline.templateHint, calibration),
    settings.profileOverrides.holeDiameterMm,
    { mode: session?.backingMode ?? 'auto', colour: session?.backing?.colour ?? null },
  );

  const holeDiameterMm = settings.profileOverrides.holeDiameterMm;
  return commitAdjustment(ctx, photoId, (current) => {
    const kept = current.shots.filter((shot) => shot.source === 'manual');
    // REV-46: a detection within SAME_HOLE_DIAMETERS of a manual shot is the same hole; the user's shot wins.
    const fresh = detected.shots.filter((found) => !kept.some((mine) => sameHole(mine, found, holeDiameterMm)));
    return {
      ...current,
      shots: [...kept, ...withUniqueIds(fresh, kept)],
      pipeline: { ...current.pipeline, detection: detected.detection },
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
