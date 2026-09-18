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

/** Records written before REV-38 are migrated on read (backing-sheet.md §3, milestone step 1). */
function parse(id: string, raw: unknown): BiathlonSession {
  const parsed = BiathlonSession.safeParse(upgradeSession(raw));
  if (!parsed.success) throw new CorruptRecordError('sessions', id);
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

/** All sessions, ordered by `updatedAt` descending. */
export async function listSessionRecords(dbOrTx: Executor): Promise<BiathlonSession[]> {
  const raws = isTx(dbOrTx)
    ? await dbOrTx.objectStore('sessions').getAll()
    : await dbOrTx.getAll('sessions');
  const sessions = raws.map((raw) => parse(idOf(raw), raw));
  return sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}
