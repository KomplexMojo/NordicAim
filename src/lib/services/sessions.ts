import { BiathlonSession, repairSession, upgradeSession } from '@/lib/domain/session';
import { photoPrefix, diagramPrefix, artifactPrefix } from '@/lib/store/blob-keys';
import { deleteByPrefix } from '@/lib/store/blobs-repo';
import { deleteAnalysisRecord } from '@/lib/store/analyses-repo';
import { deletePhotoRecord, listPhotoIdsBySession } from '@/lib/store/photos-repo';
import {
  deleteSessionRecord,
  getRawSessionRecord,
  getSessionRecord,
  listSessionRecords,
  listSessionRecordsWithProblems,
  putSessionRecord,
  type UnreadableRecord,
} from '@/lib/store/sessions-repo';
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

/** The sessions plus any record the schema rejected, so a screen can say so instead of showing nothing. */
export async function listSessionsWithProblems(
  ctx: ServiceContext,
): Promise<{ sessions: BiathlonSession[]; unreadable: UnreadableRecord[] }> {
  return listSessionRecordsWithProblems(ctx.db);
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
    // A blank name is a field being retyped, not a rename: keep the current one (owner, 2026-09-19).
    name: input.name?.trim() ? input.name.trim() : session.name,
    sessionDate: input.sessionDate ?? session.sessionDate,
    notes: input.notes ?? session.notes,
    updatedAt: ctx.now().toISOString(),
  };
  await putSessionRecord(tx, updated);
  await tx.done;
  pipelineHooks.notify();
  return updated;
}

/** What deleting a session removes, for the confirmation dialog and the toast afterwards. */
export interface SessionDeletionReport {
  /** The stored name, or `null` when the record is too damaged to have a readable one. */
  name: string | null;
  sessionDate: string | null;
  /** When the session record was made and last changed (REV-117), for the delete screen; null when unreadable. */
  createdAt: string | null;
  updatedAt: string | null;
  /** False for a session record the schema rejects (it can still be deleted). */
  readable: boolean;
  photos: number;
  analyses: number;
  artifacts: number;
  shares: number;
}

function stringOf(raw: unknown, key: string): string | null {
  if (raw === null || typeof raw !== 'object' || !(key in raw)) return null;
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function idsOf(raw: unknown, key: string): string[] {
  if (raw === null || typeof raw !== 'object' || !(key in raw)) return [];
  const value = (raw as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : stringOf(item, 'id')))
    .filter((id): id is string => id !== null);
}

function countOf(raw: unknown, key: string): number {
  if (raw === null || typeof raw !== 'object' || !(key in raw)) return 0;
  const value = (raw as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.length : 0;
}

/** Every photo the session owns: those the photo index finds, plus any its own list names (a record may be missing). */
async function photoIdsFor(tx: Parameters<typeof listPhotoIdsBySession>[0], sessionId: string, raw: unknown): Promise<string[]> {
  return [...new Set([...(await listPhotoIdsBySession(tx, sessionId)), ...idsOf(raw, 'photoIds')])];
}

/**
 * Issue #18. What deleting this session would remove — read-only, and computed exactly as `deleteSession` does, so the
 * counts the owner is shown are the counts that go. Works on a session the schema cannot read.
 */
export async function previewSessionDeletion(ctx: ServiceContext, sessionId: string): Promise<SessionDeletionReport> {
  // Plain reads on the database: this changes nothing, so it needs no transaction of its own.
  const raw = await getRawSessionRecord(ctx.db, sessionId);
  if (raw === undefined || raw === null) throw new SessionNotFoundError(sessionId);
  const photoIds = await photoIdsFor(ctx.db, sessionId, raw);
  let analyses = 0;
  for (const id of photoIds) if ((await ctx.db.get('analyses', id)) !== undefined) analyses += 1;
  return {
    name: stringOf(raw, 'name'),
    sessionDate: stringOf(raw, 'sessionDate'),
    createdAt: stringOf(raw, 'createdAt'),
    updatedAt: stringOf(raw, 'updatedAt'),
    readable: BiathlonSession.safeParse(repairSession(upgradeSession(raw))).success,
    photos: photoIds.length,
    analyses,
    artifacts: countOf(raw, 'artifacts'),
    shares: countOf(raw, 'shares'),
  };
}

/**
 * Cascade delete (issue #18): the session, its photos, their analyses, every `photo:<pid>:*` / `diagram:<pid>:*` blob and every
 * summary image (`artifact:<aid>:*`), in one transaction. **It works from raw records and parses nothing**, so a photo or a
 * session record the schema rejects is removed too — "everything attached" means everything. Returns what was removed.
 */
export async function deleteSession(ctx: ServiceContext, sessionId: string): Promise<SessionDeletionReport> {
  const tx = ctx.db.transaction(['sessions', 'photos', 'analyses', 'blobs'], 'readwrite');
  const raw = await getRawSessionRecord(tx, sessionId);
  if (raw === undefined || raw === null) throw new SessionNotFoundError(sessionId);

  const photoIds = await photoIdsFor(tx, sessionId, raw);
  const readable = BiathlonSession.safeParse(repairSession(upgradeSession(raw))).success;
  let analyses = 0;
  for (const id of photoIds) {
    if ((await tx.objectStore('analyses').get(id)) !== undefined) analyses += 1;
    await deleteAnalysisRecord(tx, id);
    await deletePhotoRecord(tx, id);
    await deleteByPrefix(tx, photoPrefix(id));
    await deleteByPrefix(tx, diagramPrefix(id));
  }
  for (const artifactId of idsOf(raw, 'artifacts')) {
    await deleteByPrefix(tx, artifactPrefix(artifactId));
  }
  await deleteSessionRecord(tx, sessionId);
  await tx.done;
  // Screens re-read on this event (analysis-pipeline §5); without it the session list would keep showing the row.
  emitPipelineChanged({ sessionId });
  pipelineHooks.notify();

  return {
    name: stringOf(raw, 'name'),
    sessionDate: stringOf(raw, 'sessionDate'),
    createdAt: stringOf(raw, 'createdAt'),
    updatedAt: stringOf(raw, 'updatedAt'),
    readable,
    photos: photoIds.length,
    analyses,
    artifacts: countOf(raw, 'artifacts'),
    shares: countOf(raw, 'shares'),
  };
}
