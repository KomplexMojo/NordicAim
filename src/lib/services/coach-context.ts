// coach-context-import.md §5 (M29, REV-159): attach a 545 Coach export to one session. Pick → verify (named refusal, nothing written)
// → match by date → fingerprint → preview → Add (duplicate check, then delete-then-write) or Cancel; Remove clears it. The context is
// additive: it never touches `BiathlonSession` or `TargetAnalysis`, so it can never overwrite a manual edit.

import {
  fingerprintSource,
  isEmptyMatch,
  matchCoachContext,
  parseCoachContextText,
  type AttachedCoachContext,
  type CoachContextFile,
  type CoachRecordKind,
  type CoachRefusal,
  type MetalContext,
  type WindContext,
  type ZeroAdjustment,
} from '@/lib/domain/coach-context';
import { clientNow } from '@/lib/media/capture-time';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { summaryHooks } from '@/lib/pipeline/hooks';
import {
  deleteCoachContext,
  findFingerprintCollision,
  getCoachContext as getCoachContextRecord,
  listCoachContextSessionIds,
  putCoachContext,
} from '@/lib/store/coach-context-repo';
import { getSessionRecord } from '@/lib/store/sessions-repo';

import type { ServiceContext } from './context';
import { SessionNotFoundError } from './sessions';

/**
 * §5 step 4 / §7: a zero click's `at` as a local date on this phone, in the phone's own timezone at attach time. Reuses the app's
 * one local-time conversion (`clientNow`, `media/capture-time.ts`), so it agrees with how a session's own date is given.
 */
export function deviceLocalDate(utc: string): string {
  return clientNow(new Date(utc)).clientLocal.slice(0, 10);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** §5 step 6: the fingerprint of one 545 Coach record: sha256 over its own fields only (`fingerprintSource`). */
export async function coachFingerprint(kind: CoachRecordKind, record: MetalContext | ZeroAdjustment | WindContext): Promise<string> {
  return sha256Hex(fingerprintSource(kind, record));
}

/** What the preview screen shows and what Add writes: the matched records, already fingerprinted. */
export interface CoachAttachPreview {
  sessionId: string;
  sessionDate: string;
  file: Pick<CoachContextFile, 'source' | 'conventions' | 'athleteHint' | 'range'>;
  metal: AttachedCoachContext['metal'];
  zero: AttachedCoachContext['zero'];
  wind: AttachedCoachContext['wind'];
  /** No record in the file is for this session's date: there is nothing to Add. */
  empty: boolean;
}

export type CoachAttachResult = { ok: true; preview: CoachAttachPreview } | { ok: false; reason: CoachRefusal; problem: string };

/**
 * §5 steps 2-4: verifies a picked file's text and matches its records to the session by date, computing each record's fingerprint.
 * Writes nothing: a refused file comes back with its reason named, and a good one as the preview for the owner to Add or Cancel.
 */
export async function prepareCoachAttach(
  ctx: ServiceContext,
  sessionId: string,
  text: string,
  localDateOf: (utc: string) => string = deviceLocalDate,
): Promise<CoachAttachResult> {
  const session = await getSessionRecord(ctx.db, sessionId);
  if (session === null) throw new SessionNotFoundError(sessionId);
  const parsed = parseCoachContextText(text);
  if (!parsed.ok) return parsed;
  const { file } = parsed;
  const match = matchCoachContext(file, session.sessionDate, localDateOf);
  const preview: CoachAttachPreview = {
    sessionId,
    sessionDate: session.sessionDate,
    file: { source: file.source, conventions: file.conventions, athleteHint: file.athleteHint, range: file.range },
    metal: await Promise.all(match.metal.map(async (record) => ({ fingerprint: await coachFingerprint('metal', record), record }))),
    zero: await Promise.all(match.zero.map(async (record) => ({ fingerprint: await coachFingerprint('zero', record), record }))),
    wind: await Promise.all(match.wind.map(async (record) => ({ fingerprint: await coachFingerprint('wind', record), record }))),
    empty: isEmptyMatch(match),
  };
  return { ok: true, preview };
}

/** §5 step 6: a record in the batch is already attached to a different session. The whole Add is refused; nothing is written. */
export class CoachContextDuplicateError extends Error {
  readonly otherSessionId: string;
  readonly otherSessionLabel: string;
  constructor(otherSessionId: string, otherSessionLabel: string) {
    super(`Some of these 545 Coach records are already attached to ${otherSessionLabel}. Remove them there first; nothing was added.`);
    this.name = 'CoachContextDuplicateError';
    this.otherSessionId = otherSessionId;
    this.otherSessionLabel = otherSessionLabel;
  }
}

/** Add with nothing matched (§7 leaves this open): refused rather than writing an empty entry. */
export class CoachContextEmptyError extends Error {
  constructor(sessionDate: string) {
    super(`This 545 Coach export has nothing for ${sessionDate}; nothing was added.`);
    this.name = 'CoachContextEmptyError';
  }
}

async function sessionLabel(ctx: ServiceContext, sessionId: string): Promise<string> {
  try {
    const other = await getSessionRecord(ctx.db, sessionId);
    if (other !== null) return `“${other.name}” (${other.sessionDate})`;
  } catch {
    // An unreadable session record still gets named, by its id.
  }
  return `another session (${sessionId})`;
}

/**
 * §5 step 6, on Add. Everything is prepared first — the preview's fingerprints and the cross-session duplicate scan — and only then
 * one readwrite transaction deletes this session's existing entry and writes the new one: a re-attach replaces, never merges. A
 * collision with a different session throws `CoachContextDuplicateError` and writes nothing.
 */
export async function addCoachContext(ctx: ServiceContext, preview: CoachAttachPreview): Promise<AttachedCoachContext> {
  if (preview.empty) throw new CoachContextEmptyError(preview.sessionDate);
  const session = await getSessionRecord(ctx.db, preview.sessionId);
  if (session === null) throw new SessionNotFoundError(preview.sessionId);

  const fingerprints = new Set([...preview.metal, ...preview.zero, ...preview.wind].map((r) => r.fingerprint));
  const collision = await findFingerprintCollision(ctx.db, fingerprints, preview.sessionId);
  if (collision !== null) throw new CoachContextDuplicateError(collision.sessionId, await sessionLabel(ctx, collision.sessionId));

  const entry: AttachedCoachContext = {
    schemaVersion: 1,
    sessionId: preview.sessionId,
    attachedAt: ctx.now().toISOString(),
    source: preview.file.source,
    conventions: preview.file.conventions,
    metal: preview.metal,
    zero: preview.zero,
    wind: preview.wind,
  };

  const tx = ctx.db.transaction(['coachContext'], 'readwrite');
  await deleteCoachContext(tx, preview.sessionId);
  await putCoachContext(tx, entry);
  await tx.done;

  emitPipelineChanged({ sessionId: preview.sessionId });
  // §6: the summary image shows the context, so it is drawn again (the scheduler skips a session with nothing analyzed).
  summaryHooks.schedule(preview.sessionId);
  return entry;
}

/** §5 step 7: deletes the session's entry outright, freeing its records to be attached elsewhere. */
export async function removeCoachContext(ctx: ServiceContext, sessionId: string): Promise<void> {
  const tx = ctx.db.transaction(['coachContext'], 'readwrite');
  await deleteCoachContext(tx, sessionId);
  await tx.done;
  emitPipelineChanged({ sessionId });
  summaryHooks.schedule(sessionId);
}

export async function getCoachContext(ctx: ServiceContext, sessionId: string): Promise<AttachedCoachContext | null> {
  return getCoachContextRecord(ctx.db, sessionId);
}

/** The sessions with 545 Coach context attached. */
export async function listCoachContextSessions(ctx: ServiceContext): Promise<Set<string>> {
  return new Set(await listCoachContextSessionIds(ctx.db));
}
