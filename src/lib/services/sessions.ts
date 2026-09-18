import { photoStatus } from '@/lib/domain/status';
import { forSettings, isTargetPhoto, type BackingMode, type BackingSheet } from '@/lib/domain/backing';
import { BiathlonSession } from '@/lib/domain/session';
import { photoPrefix, diagramPrefix, artifactPrefix } from '@/lib/store/blob-keys';
import { deleteByPrefix } from '@/lib/store/blobs-repo';
import { deleteAnalysisRecord, getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { deletePhotoRecord, listPhotosBySession, putPhotoRecord } from '@/lib/store/photos-repo';
import { deleteSessionRecord, getSessionRecord, listSessionRecords, putSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings, putSettings } from '@/lib/store/settings-repo';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { pipelineHooks } from '@/lib/pipeline/hooks';

import type { ServiceContext } from './context';

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

export interface CreateSessionInput {
  name?: string;
  sessionDate?: string;
  notes?: string;
}

/**
 * Defaults name to `Session <sessionDate>` per analysis-pipeline §1 when not given. A new session
 * inherits the last backing the user chose (backing-sheet.md §2); later changes to that default never
 * alter this session, because the choice is copied onto it here.
 */
export async function createSession(ctx: ServiceContext, input: CreateSessionInput = {}): Promise<BiathlonSession> {
  const now = ctx.now();
  const nowIso = now.toISOString();
  const sessionDate = input.sessionDate ?? nowIso.slice(0, 10);
  const settings = await getSettings(ctx.db);
  const session: BiathlonSession = {
    schemaVersion: 2,
    id: ctx.newId(),
    name: input.name ?? `Session ${sessionDate}`,
    sessionDate,
    createdAt: nowIso,
    updatedAt: nowIso,
    photoIds: [],
    analyzeRequestedAt: null,
    artifacts: [],
    shares: [],
    notes: input.notes ?? '',
    backingMode: settings.lastBackingMode,
    backing: settings.lastBacking,
  };
  await putSessionRecord(ctx.db, session);
  pipelineHooks.notify();
  return session;
}

export async function getSession(ctx: ServiceContext, sessionId: string): Promise<BiathlonSession | null> {
  return getSessionRecord(ctx.db, sessionId);
}

/** Ordered by `updatedAt` descending (data-model §6, §7). */
export async function listSessions(ctx: ServiceContext): Promise<BiathlonSession[]> {
  return listSessionRecords(ctx.db);
}

export interface UpdateSessionInput {
  name?: string;
  sessionDate?: string;
  notes?: string;
}

export async function updateSession(
  ctx: ServiceContext,
  sessionId: string,
  input: UpdateSessionInput,
): Promise<BiathlonSession> {
  const tx = ctx.db.transaction('sessions', 'readwrite');
  const session = await getSessionRecord(tx, sessionId);
  if (session === null) throw new SessionNotFoundError(sessionId);
  const updated: BiathlonSession = {
    ...session,
    name: input.name ?? session.name,
    sessionDate: input.sessionDate ?? session.sessionDate,
    notes: input.notes ?? session.notes,
    updatedAt: ctx.now().toISOString(),
  };
  await putSessionRecord(tx, updated);
  await tx.done;
  pipelineHooks.notify();
  return updated;
}

export interface SetBackingInput {
  backingMode: BackingMode;
  backing: BackingSheet | null;
}

/**
 * backing-sheet.md §2, §5. Sets the session's backing, remembers it as the app default for the next
 * session (`AppSettings.lastBacking*`, never with a card photo id), and re-queues detection: changing
 * the backing sets Stage A back to pending for every one of the session's photos whose shots are all
 * `auto`. Photos with a manual shot are left alone — A5 never runs for them (analysis-pipeline §8)
 * and they would gain nothing.
 *
 * The spec says "back to pending **from A5**"; Stage A has no finer resume point, so the whole stage
 * re-runs. A4 is skipped anyway for a manual calibration, and A3 is cheap. Stage B is reset with it
 * when it had already finished, so the score is rebuilt from the new shots rather than left stale.
 */
export async function setSessionBacking(
  ctx: ServiceContext,
  sessionId: string,
  input: SetBackingInput,
): Promise<BiathlonSession> {
  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['sessions', 'photos', 'analyses', 'settings'], 'readwrite');

  const session = await getSessionRecord(tx, sessionId);
  if (session === null) throw new SessionNotFoundError(sessionId);
  const changed = session.backingMode !== input.backingMode || !sameBacking(session.backing, input.backing);
  const updated: BiathlonSession = {
    ...session,
    backingMode: input.backingMode,
    backing: input.backing,
    updatedAt: nowIso,
  };
  await putSessionRecord(tx, updated);

  const settings = await getSettings(tx);
  await putSettings(tx, {
    ...settings,
    lastBackingMode: input.backingMode,
    lastBacking: forSettings(input.backing),
  });

  if (changed) {
    for (const photo of await listPhotosBySession(tx, sessionId)) {
      if (!isTargetPhoto(photo)) continue;
      const analysis = await getAnalysisRecord(tx, photo.id);
      if (analysis === null) continue;
      if (analysis.shots.some((shot) => shot.source === 'manual')) continue;
      const next = {
        ...analysis,
        pipeline: {
          ...analysis.pipeline,
          stageA: 'pending' as const,
          stageB: analysis.pipeline.stageB === 'done' ? ('pending' as const) : analysis.pipeline.stageB,
          error: null,
        },
        updatedAt: nowIso,
      };
      await putAnalysisRecord(tx, next);
      const { status, reasons } = photoStatus({
        categorization: photo.categorization,
        analysis: next,
        result: next.computed?.result ?? null,
      });
      await putPhotoRecord(tx, { ...photo, status, reasons });
    }
  }

  await tx.done;
  emitPipelineChanged({ sessionId });
  pipelineHooks.notify();
  return updated;
}

/** Two backings are the same when their kind, source, card and colour all match (backing-sheet.md §5). */
function sameBacking(a: BackingSheet | null, b: BackingSheet | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.source !== b.source || a.cardPhotoId !== b.cardPhotoId) return false;
  if (a.colour === null || b.colour === null) return a.colour === b.colour;
  return (
    a.colour.hueDeg === b.colour.hueDeg &&
    a.colour.hueSpreadDeg === b.colour.hueSpreadDeg &&
    a.colour.satP10 === b.colour.satP10 &&
    a.colour.valP10 === b.colour.valP10 &&
    a.colour.samples === b.colour.samples
  );
}

/** Cascade delete: session, its photos (including its backing-card photos), their analyses, and every
 * `photo:<pid>:*` / `diagram:<pid>:*` / `artifact:<aid>:*` blob. */
export async function deleteSession(ctx: ServiceContext, sessionId: string): Promise<void> {
  const tx = ctx.db.transaction(['sessions', 'photos', 'analyses', 'blobs'], 'readwrite');
  const session = await getSessionRecord(tx, sessionId);
  if (session === null) throw new SessionNotFoundError(sessionId);
  const photos = await listPhotosBySession(tx, sessionId);

  for (const photo of photos) {
    await deleteAnalysisRecord(tx, photo.id);
    await deletePhotoRecord(tx, photo.id);
    await deleteByPrefix(tx, photoPrefix(photo.id));
    await deleteByPrefix(tx, diagramPrefix(photo.id));
  }
  for (const artifact of session.artifacts) {
    await deleteByPrefix(tx, artifactPrefix(artifact.id));
  }
  await deleteSessionRecord(tx, sessionId);
  await tx.done;
  pipelineHooks.notify();
}
