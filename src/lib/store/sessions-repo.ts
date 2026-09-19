import { BiathlonSession, upgradeSession } from '@/lib/domain/session';

import type { AppDb, AppTx } from './db';
import { CorruptRecordError } from './errors';

type Executor = AppDb | AppTx;

function isTx(x: Executor): x is AppTx {
  return 'objectStore' in x;
}

function idOf(raw: unknown): string {
  return raw !== null && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string' ? raw.id : 'unknown';
}

/** Schema-1 and schema-2 records are upgraded to schema 3 on read (backing-sheet.md §3a step 3). */
function parse(id: string, raw: unknown): BiathlonSession {
  const parsed = BiathlonSession.safeParse(upgradeSession(raw));
  if (!parsed.success) throw new CorruptRecordError('sessions', id, parsed.error);
  return parsed.data;
}

export async function getSessionRecord(dbOrTx: Executor, id: string): Promise<BiathlonSession | null> {
  const raw = isTx(dbOrTx) ? await dbOrTx.objectStore('sessions').get(id) : await dbOrTx.get('sessions', id);
  if (raw == null) return null;
  return parse(id, raw);
}

export async function putSessionRecord(dbOrTx: Executor, session: BiathlonSession): Promise<void> {
  if (isTx(dbOrTx)) await dbOrTx.objectStore('sessions').put(session);
  else await dbOrTx.put('sessions', session);
}

export async function deleteSessionRecord(dbOrTx: Executor, id: string): Promise<void> {
  if (isTx(dbOrTx)) await dbOrTx.objectStore('sessions').delete(id);
  else await dbOrTx.delete('sessions', id);
}

/** A record the schema rejected, kept aside rather than thrown (see `listSessionRecordsWithProblems`). */
export interface UnreadableRecord {
  id: string;
  reason: string;
}

/**
 * All sessions, ordered by `updatedAt` descending, **plus** the ones that did not parse.
 *
 * One unreadable record must never hide the rest: this used to `parse` every row, so a single bad
 * session threw out of the home screen and the session list, and every session looked lost (owner,
 * 2026-09-19: "the entire application stops working and all of the sessions that I have done are
 * lost"). The records are still in the database; they are reported here and by Diagnostics instead.
 */
export async function listSessionRecordsWithProblems(
  dbOrTx: Executor,
): Promise<{ sessions: BiathlonSession[]; unreadable: UnreadableRecord[] }> {
  const raws = isTx(dbOrTx)
    ? await dbOrTx.objectStore('sessions').getAll()
    : await dbOrTx.getAll('sessions');
  const sessions: BiathlonSession[] = [];
  const unreadable: UnreadableRecord[] = [];
  for (const raw of raws) {
    const id = idOf(raw);
    const parsed = BiathlonSession.safeParse(upgradeSession(raw));
    if (parsed.success) sessions.push(parsed.data);
    else unreadable.push({ id, reason: new CorruptRecordError('sessions', id, parsed.error).message });
  }
  sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return { sessions, unreadable };
}

/** All readable sessions, ordered by `updatedAt` descending. */
export async function listSessionRecords(dbOrTx: Executor): Promise<BiathlonSession[]> {
  return (await listSessionRecordsWithProblems(dbOrTx)).sessions;
}
