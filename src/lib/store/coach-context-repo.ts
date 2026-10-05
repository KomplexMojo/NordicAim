// coach-context-import.md §5 (M29, REV-159): the `coachContext` store, one row per session (keyPath `sessionId`).

import { AttachedCoachContext } from '@/lib/domain/coach-context';

import type { AppDb, AppTx } from './db';
import { CorruptRecordError, UnwritableRecordError } from './errors';

type Executor = AppDb | AppTx;

function isTx(x: Executor): x is AppTx {
  return 'objectStore' in x;
}

/** The session's attached 545 Coach context, or null when none is attached. */
export async function getCoachContext(dbOrTx: Executor, sessionId: string): Promise<AttachedCoachContext | null> {
  const raw: unknown = isTx(dbOrTx) ? await dbOrTx.objectStore('coachContext').get(sessionId) : await dbOrTx.get('coachContext', sessionId);
  if (raw == null) return null;
  const parsed = AttachedCoachContext.safeParse(raw);
  if (!parsed.success) throw new CorruptRecordError('coachContext', sessionId, parsed.error);
  return parsed.data;
}

/** Writes the whole row; a row the schema would reject on the way back in is refused. */
export async function putCoachContext(dbOrTx: Executor, entry: AttachedCoachContext): Promise<void> {
  const checked = AttachedCoachContext.safeParse(entry);
  if (!checked.success) throw new UnwritableRecordError('coachContext', entry.sessionId, checked.error);
  if (isTx(dbOrTx)) await dbOrTx.objectStore('coachContext').put(checked.data);
  else await dbOrTx.put('coachContext', checked.data);
}

export async function deleteCoachContext(dbOrTx: Executor, sessionId: string): Promise<void> {
  if (isTx(dbOrTx)) await dbOrTx.objectStore('coachContext').delete(sessionId);
  else await dbOrTx.delete('coachContext', sessionId);
}

/** Every session that has 545 Coach context attached (for the Sessions list's marks). */
export async function listCoachContextSessionIds(db: AppDb): Promise<string[]> {
  return (await db.getAllKeys('coachContext')).map(String);
}

export interface FingerprintCollision {
  /** The other session that already holds the record. */
  sessionId: string;
  fingerprint: string;
}

/**
 * §5 step 6: the first stored record, attached to a session OTHER than `exceptSessionId`, whose fingerprint is one of
 * `fingerprints`; null when none collides. Works from raw rows (only their fingerprints are read), so one unreadable row elsewhere
 * cannot hide a duplicate or block an Add.
 */
export async function findFingerprintCollision(
  db: AppDb,
  fingerprints: ReadonlySet<string>,
  exceptSessionId: string,
): Promise<FingerprintCollision | null> {
  if (fingerprints.size === 0) return null;
  const rows: unknown[] = await db.getAll('coachContext');
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const { sessionId } = row as { sessionId?: unknown };
    if (typeof sessionId !== 'string' || sessionId === exceptSessionId) continue;
    for (const list of ['metal', 'zero', 'wind'] as const) {
      const items = (row as Record<string, unknown>)[list];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const fingerprint = (item as { fingerprint?: unknown } | null)?.fingerprint;
        if (typeof fingerprint === 'string' && fingerprints.has(fingerprint)) return { sessionId, fingerprint };
      }
    }
  }
  return null;
}
