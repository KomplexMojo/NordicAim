// analysis-pipeline §2 (A3, A4), §5, §8. Stage A for one photo: review the image, align it on the
// template, save the result. A5 (shot detection) is added in M11.

import * as Comlink from 'comlink';

import { BLUR_THRESHOLD } from '@/lib/cv/constants';
import type { TargetAnalysis } from '@/lib/domain/analysis';
import type { Warning } from '@/lib/domain/enums';
import type { Calibration, TargetPhoto } from '@/lib/domain/photo';
import { photoStatus } from '@/lib/domain/status';
import { scaleCalibration } from '@/lib/geometry/transform';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { AnalysisNotFoundError, PhotoNotFoundError } from '@/lib/services/photos';
import type { ServiceContext } from '@/lib/services/context';
import type { ImageTools } from '@/lib/services/ingest';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { photoWorkingKey } from '@/lib/store/blob-keys';
import { getBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord, putPhotoRecord } from '@/lib/store/photos-repo';
import type { CvWorkerApi } from '@/workers/cv-client';

import { chooseAlignment } from './alignment';

/** Only the part of the worker Stage A needs, so tests can stub it. */
export type CvApi = Pick<CvWorkerApi, 'reviewAndAlign'>;

export class WorkingImageMissingError extends Error {
  constructor(photoId: string) {
    super(`Working image missing for photo: ${photoId}`);
    this.name = 'WorkingImageMissingError';
  }
}

/** capture-overlay §3.3: the prior is stored in FRAME px; Stage A scales it to working px. */
export function priorInWorkingPx(photo: TargetPhoto): Calibration | null {
  const capture = photo.capture;
  const prior = capture?.calibrationPriorFramePx ?? null;
  if (capture === null || prior === null) return null;
  const frameLongest = Math.max(capture.frameWidthPx, capture.frameHeightPx);
  const workingLongest = Math.max(photo.working.widthPx, photo.working.heightPx);
  if (frameLongest <= 0) return null;
  return scaleCalibration(prior, workingLongest / frameLongest);
}

/** One transaction: save the mutated analysis and the photo status it implies (data-model §7). */
async function commitAnalysis(
  ctx: ServiceContext,
  photoId: string,
  mutate: (analysis: TargetAnalysis) => TargetAnalysis,
): Promise<void> {
  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['photos', 'analyses'], 'readwrite');
  const photo = await getPhotoRecord(tx, photoId);
  const analysis = await getAnalysisRecord(tx, photoId);
  if (photo === null || analysis === null) {
    await tx.done;
    throw photo === null ? new PhotoNotFoundError(photoId) : new AnalysisNotFoundError(photoId);
  }

  const next: TargetAnalysis = { ...mutate(analysis), updatedAt: nowIso };
  const { status, reasons } = photoStatus({
    categorization: photo.categorization,
    analysis: next,
    result: next.computed?.result ?? null,
  });

  await putAnalysisRecord(tx, next);
  await putPhotoRecord(tx, { ...photo, status, reasons });
  await tx.done;
}

/**
 * analysis-pipeline §5. Runs A3 and A4 for one photo and records the outcome. Never throws for a CV or
 * decode failure: it records `stageA: 'error'` instead, so the runner does not retry in a loop.
 */
export async function runStageA(
  ctx: ServiceContext,
  photoId: string,
  cvApi: CvApi,
  imageTools: ImageTools,
): Promise<void> {
  // The worker decodes the working JPEG itself; `imageTools` is part of the service signature
  // (data-model §7) and is used by later stages.
  void imageTools;

  const photo = await getPhotoRecord(ctx.db, photoId);
  if (photo === null) throw new PhotoNotFoundError(photoId);
  const analysis = await getAnalysisRecord(ctx.db, photoId);
  if (analysis === null) throw new AnalysisNotFoundError(photoId);

  await commitAnalysis(ctx, photoId, (a) => ({
    ...a,
    pipeline: { ...a.pipeline, stageA: 'running', error: null },
  }));
  emitPipelineChanged({ sessionId: photo.sessionId, photoId });

  try {
    const workingBlob = await getBlob(ctx.db, photoWorkingKey(photoId));
    if (workingBlob === null) throw new WorkingImageMissingError(photoId);
    const bytes = await workingBlob.arrayBuffer();

    // §8: a calibration the user saved in Adjust is never replaced, so A4 is skipped for it.
    const manual = analysis.calibration?.source === 'manual';
    const manualCalibration = manual ? analysis.calibration : null;
    const prior = manual ? null : priorInWorkingPx(photo);
    const overlayTemplate = photo.capture?.overlayTemplate ?? null;

    const review = await cvApi.reviewAndAlign(Comlink.transfer(bytes, [bytes]), prior, overlayTemplate);

    const choice =
      manualCalibration !== null
        ? {
            calibration: manualCalibration,
            method: 'manual' as const,
            confidence: analysis.pipeline.alignment.confidence,
            warnings: [] as Array<'alignment-uncertain'>,
          }
        : chooseAlignment({ prior, detection: review.detection });

    const warnings: Warning[] = [...choice.warnings];
    if (review.sharpness < BLUR_THRESHOLD) warnings.push('image-blurry');
    // Stage B owns `template-mismatch` (analysis-pipeline §2 B4); keep it if it was already there.
    if (analysis.pipeline.warnings.includes('template-mismatch')) warnings.push('template-mismatch');

    await commitAnalysis(ctx, photoId, (a) => ({
      ...a,
      calibration: choice.calibration,
      pipeline: {
        ...a.pipeline,
        stageA: 'done',
        error: null,
        alignment: { method: choice.method, confidence: choice.confidence },
        templateHint: review.templateHint,
        sharpness: review.sharpness,
        warnings,
      },
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await commitAnalysis(ctx, photoId, (a) => ({
      ...a,
      pipeline: { ...a.pipeline, stageA: 'error', error: message.slice(0, 200) },
    }));
  }

  emitPipelineChanged({ sessionId: photo.sessionId, photoId });
}
