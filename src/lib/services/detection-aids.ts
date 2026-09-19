// M21 steps 1 and 3 (REV-40, REV-41): what Adjust shows to help a person decide — the suggested holes
// and each detected hole's measured width. Both are **derived**: recomputed by the worker every time
// Adjust opens, never written to IndexedDB, never part of `analysis.shots`, never scored. That is what
// guarantees the pipeline can never overwrite a user's decision with them (analysis-pipeline §8).

import * as Comlink from 'comlink';

import type { HoleWidth } from '@/lib/cv/backing-colour';
import type { ShotCandidate } from '@/lib/cv/holes';
import type { Calibration } from '@/lib/domain/photo';
import { shotTemplate } from '@/lib/pipeline/stage-a';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { photoWorkingKey } from '@/lib/store/blob-keys';
import { getBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord } from '@/lib/store/photos-repo';
import { getSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings } from '@/lib/store/settings-repo';

import type { DetectShotsApi } from './adjust';
import type { ServiceContext } from './context';

export interface DetectionAids {
  /** The alignment the positions below are in (the stored one). Adjust re-projects them when it moves. */
  calibration: Calibration;
  suggestions: ShotCandidate[];
  holeWidths: HoleWidth[];
}

/**
 * Runs the worker's `detectShots` against the stored alignment — the same inputs A5 and Re-analyze use —
 * and keeps only the suggestions and widths; the shots it finds are ignored (they are already stored, or
 * were deliberately replaced by the user). `null` when there is nothing to measure against: no stored
 * alignment, or no working image. Reads only; writes nothing.
 */
export async function loadDetectionAids(
  ctx: ServiceContext,
  photoId: string,
  cvApi: DetectShotsApi,
): Promise<DetectionAids | null> {
  const photo = await getPhotoRecord(ctx.db, photoId);
  const analysis = await getAnalysisRecord(ctx.db, photoId);
  const calibration = analysis?.calibration ?? null;
  if (photo === null || analysis === null || calibration === null) return null;

  const workingBlob = await getBlob(ctx.db, photoWorkingKey(photoId));
  if (workingBlob === null) return null;
  const bytes = await workingBlob.arrayBuffer();
  const settings = await getSettings(ctx.db);
  const session = await getSessionRecord(ctx.db, photo.sessionId);

  const detected = await cvApi.detectShots(
    Comlink.transfer(bytes, [bytes]),
    calibration,
    shotTemplate(photo, analysis.pipeline.templateHint, calibration),
    settings.profileOverrides.holeDiameterMm,
    { mode: session?.backingMode ?? 'auto', colour: session?.backing?.colour ?? null },
  );
  return { calibration, suggestions: detected.suggestions, holeWidths: detected.holeWidths };
}
