// data-model §7, analysis-pipeline §2 (B1) / §5. `updatePhotoMetadata`, `deletePhoto`, `requestAnalysis`.

import { photoStatus } from '@/lib/domain/status';
import type { Lighting } from '@/lib/domain/enums';
import type { Categorization, TargetPhoto } from '@/lib/domain/photo';
import type { BiathlonSession } from '@/lib/domain/session';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import { deleteAnalysisRecord, getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { diagramPrefix, photoPrefix } from '@/lib/store/blob-keys';
import { deleteByPrefix } from '@/lib/store/blobs-repo';
import { deletePhotoRecord, getPhotoRecord, listPhotosBySession, putPhotoRecord } from '@/lib/store/photos-repo';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';

import type { ServiceContext } from './context';
import { SessionNotFoundError } from './sessions';

export class PhotoNotFoundError extends Error {
  constructor(photoId: string) {
    super(`Photo not found: ${photoId}`);
    this.name = 'PhotoNotFoundError';
  }
}

export class AnalysisNotFoundError extends Error {
  constructor(photoId: string) {
    super(`Analysis not found for photo: ${photoId}`);
    this.name = 'AnalysisNotFoundError';
  }
}

function categorizationEquals(a: Categorization, b: Categorization): boolean {
  return (
    a.template === b.template &&
    a.position === b.position &&
    a.roundsProne === b.roundsProne &&
    a.roundsStanding === b.roundsStanding
  );
}

export interface UpdatePhotoMetadataInput {
  categorization?: Categorization;
  lighting?: Lighting;
  notes?: string | null;
}

/** M09 step 5: one transaction; resets `pipeline.stageB` to `pending` only once analysis has been requested and
 * categorization or lighting actually changed; recomputes `status`/`reasons`; then notifies. */
export async function updatePhotoMetadata(
  ctx: ServiceContext,
  photoId: string,
  patch: UpdatePhotoMetadataInput,
): Promise<TargetPhoto> {
  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['sessions', 'photos', 'analyses'], 'readwrite');

  const photo = await getPhotoRecord(tx, photoId);
  if (photo === null) throw new PhotoNotFoundError(photoId);
  const session = await getSessionRecord(tx, photo.sessionId);
  if (session === null) throw new SessionNotFoundError(photo.sessionId);
  const analysis = await getAnalysisRecord(tx, photoId);
  if (analysis === null) throw new AnalysisNotFoundError(photoId);

  const categorization = patch.categorization ?? photo.categorization;
  const lighting = patch.lighting ?? photo.lighting;
  const notes = patch.notes !== undefined ? patch.notes : photo.notes;

  const categorizationChanged =
    patch.categorization !== undefined && !categorizationEquals(patch.categorization, photo.categorization);
  const lightingChanged = patch.lighting !== undefined && patch.lighting !== photo.lighting;

  let nextAnalysis = analysis;
  if (session.analyzeRequestedAt !== null && (categorizationChanged || lightingChanged)) {
    nextAnalysis = {
      ...analysis,
      pipeline: { ...analysis.pipeline, stageB: 'pending' },
      updatedAt: nowIso,
    };
  }

  const result = nextAnalysis.computed?.result ?? null;
  const { status, reasons } = photoStatus({ categorization, analysis: nextAnalysis, result });

  const updatedPhoto: TargetPhoto = { ...photo, categorization, lighting, notes, status, reasons };

  await putPhotoRecord(tx, updatedPhoto);
  if (nextAnalysis !== analysis) await putAnalysisRecord(tx, nextAnalysis);
  await putSessionRecord(tx, { ...session, updatedAt: nowIso });
  await tx.done;

  emitPipelineChanged({ sessionId: photo.sessionId, photoId });
  pipelineHooks.notify();

  return updatedPhoto;
}

/** Cascade delete: analysis, photo record, and its `photo:<pid>:*` / `diagram:<pid>:*` blobs; removes the id from
 * `session.photoIds`. */
export async function deletePhoto(ctx: ServiceContext, photoId: string): Promise<void> {
  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['sessions', 'photos', 'analyses', 'blobs'], 'readwrite');

  const photo = await getPhotoRecord(tx, photoId);
  if (photo === null) throw new PhotoNotFoundError(photoId);
  const session = await getSessionRecord(tx, photo.sessionId);
  if (session === null) throw new SessionNotFoundError(photo.sessionId);

  await deleteByPrefix(tx, photoPrefix(photoId));
  await deleteByPrefix(tx, diagramPrefix(photoId));
  await putSessionRecord(tx, {
    ...session,
    photoIds: session.photoIds.filter((id) => id !== photoId),
    updatedAt: nowIso,
  });
  await deletePhotoRecord(tx, photoId);
  await deleteAnalysisRecord(tx, photoId);
  await tx.done;

  emitPipelineChanged({ sessionId: photo.sessionId });
  pipelineHooks.notify();
}

/** analysis-pipeline §2 (B1), §5: sets `session.analyzeRequestedAt`, confirms lighting on every photo, and resets
 * `stageB` to `pending` for any photo whose Stage B had already finished (so re-analysis actually reruns). One
 * transaction; then notifies. The caller navigates to `#/sessions/:sid/results`. */
export async function requestAnalysis(ctx: ServiceContext, sessionId: string): Promise<BiathlonSession> {
  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['sessions', 'photos', 'analyses'], 'readwrite');

  const session = await getSessionRecord(tx, sessionId);
  if (session === null) throw new SessionNotFoundError(sessionId);
  const photos = await listPhotosBySession(tx, sessionId);

  for (const photo of photos) {
    const analysis = await getAnalysisRecord(tx, photo.id);
    if (analysis === null) continue;

    let nextAnalysis = analysis;
    if (analysis.pipeline.stageB === 'done') {
      nextAnalysis = { ...analysis, pipeline: { ...analysis.pipeline, stageB: 'pending' }, updatedAt: nowIso };
      await putAnalysisRecord(tx, nextAnalysis);
    }

    const result = nextAnalysis.computed?.result ?? null;
    const { status, reasons } = photoStatus({ categorization: photo.categorization, analysis: nextAnalysis, result });
    await putPhotoRecord(tx, { ...photo, lightingConfirmed: true, status, reasons });
  }

  const updatedSession = { ...session, analyzeRequestedAt: nowIso, updatedAt: nowIso };
  await putSessionRecord(tx, updatedSession);
  await tx.done;

  emitPipelineChanged({ sessionId });
  pipelineHooks.notify();

  return updatedSession;
}
