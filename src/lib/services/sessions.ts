import { BiathlonSession } from '@/lib/domain/session';
import { photoPrefix, diagramPrefix, artifactPrefix } from '@/lib/store/blob-keys';
import { deleteByPrefix } from '@/lib/store/blobs-repo';
import { deleteAnalysisRecord } from '@/lib/store/analyses-repo';
import { deletePhotoRecord, listPhotosBySession } from '@/lib/store/photos-repo';
import { deleteSessionRecord, getSessionRecord, listSessionRecords, putSessionRecord } from '@/lib/store/sessions-repo';
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
 * Defaults name to `Session <sessionDate>` per analysis-pipeline §1 when not given. The session carries no
 * backing: that is a Settings choice for every session (REV-48, backing-sheet.md §2).
 */
export async function createSession(ctx: ServiceContext, input: CreateSessionInput = {}): Promise<BiathlonSession> {
  const now = ctx.now();
  const nowIso = now.toISOString();
  const sessionDate = input.sessionDate ?? nowIso.slice(0, 10);
  const session: BiathlonSession = {
    schemaVersion: 3,
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

/** Cascade delete: session, its photos (including any pre-REV-48 backing-card photo), their analyses, and every
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
