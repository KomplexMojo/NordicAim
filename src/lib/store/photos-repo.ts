import { TargetPhoto } from '@/lib/domain/photo';

import type { AppDb, AppTx } from './db';
import { CorruptRecordError } from './errors';
import type { UnreadableRecord } from './sessions-repo';

type Executor = AppDb | AppTx;

function isTx(x: Executor): x is AppTx {
  return 'objectStore' in x;
}

function idOf(raw: unknown): string {
  return raw !== null && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string' ? raw.id : 'unknown';
}

function parse(id: string, raw: unknown): TargetPhoto {
  const parsed = TargetPhoto.safeParse(raw);
  if (!parsed.success) throw new CorruptRecordError('photos', id, parsed.error);
  return parsed.data;
}

export async function getPhotoRecord(dbOrTx: Executor, id: string): Promise<TargetPhoto | null> {
  const raw = isTx(dbOrTx) ? await dbOrTx.objectStore('photos').get(id) : await dbOrTx.get('photos', id);
  if (raw == null) return null;
  return parse(id, raw);
}

export async function putPhotoRecord(dbOrTx: Executor, photo: TargetPhoto): Promise<void> {
  if (isTx(dbOrTx)) await dbOrTx.objectStore('photos').put(photo);
  else await dbOrTx.put('photos', photo);
}

export async function deletePhotoRecord(dbOrTx: Executor, id: string): Promise<void> {
  if (isTx(dbOrTx)) await dbOrTx.objectStore('photos').delete(id);
  else await dbOrTx.delete('photos', id);
}

/**
 * The photos that parse. One unreadable record must never hide the rest, or stop the pipeline planning
 * over the others (owner, 2026-09-19: every session appeared lost). Diagnostics reports the rejects.
 */
function readable(raws: unknown[]): TargetPhoto[] {
  const photos: TargetPhoto[] = [];
  for (const raw of raws) {
    const parsed = TargetPhoto.safeParse(raw);
    if (parsed.success) photos.push(parsed.data);
  }
  return photos;
}

export async function listPhotosBySession(dbOrTx: Executor, sessionId: string): Promise<TargetPhoto[]> {
  let raws: unknown[];
  if (isTx(dbOrTx)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = dbOrTx.objectStore('photos') as any;
    raws = await store.index('by-sessionId').getAll(sessionId);
  } else {
    raws = await dbOrTx.getAllFromIndex('photos', 'by-sessionId', sessionId);
  }
  return readable(raws);
}

/** Every photo in the database (the runner plans over all of them). */
export async function listPhotoRecords(dbOrTx: Executor): Promise<TargetPhoto[]> {
  const raws = isTx(dbOrTx) ? await dbOrTx.objectStore('photos').getAll() : await dbOrTx.getAll('photos');
  return readable(raws);
}

/** Every photo the schema rejected, for Diagnostics to report. */
export async function listUnreadablePhotos(dbOrTx: Executor): Promise<UnreadableRecord[]> {
  const raws = isTx(dbOrTx) ? await dbOrTx.objectStore('photos').getAll() : await dbOrTx.getAll('photos');
  const bad: UnreadableRecord[] = [];
  for (const raw of raws) {
    const id = idOf(raw);
    const parsed = TargetPhoto.safeParse(raw);
    if (!parsed.success) bad.push({ id, reason: new CorruptRecordError('photos', id, parsed.error).message });
  }
  return bad;
}

/**
 * The ids of every photo record for a session, **without parsing anything** — so a photo the schema rejects is
 * still found. Deleting a session must remove everything attached to it, readable or not (issue #18): the
 * tolerant list above skips unreadable records, which would leave them and their blobs behind.
 */
export async function listPhotoIdsBySession(dbOrTx: Executor, sessionId: string): Promise<string[]> {
  let raws: unknown[];
  if (isTx(dbOrTx)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = dbOrTx.objectStore('photos') as any;
    raws = await store.index('by-sessionId').getAll(sessionId);
  } else {
    raws = await dbOrTx.getAllFromIndex('photos', 'by-sessionId', sessionId);
  }
  return raws.map((raw) => idOf(raw)).filter((id) => id !== 'unknown');
}
