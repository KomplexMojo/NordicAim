import { TargetPhoto } from '@/lib/domain/photo';

import type { AppDb, AppTx } from './db';
import { CorruptRecordError } from './errors';

type Executor = AppDb | AppTx;

function isTx(x: Executor): x is AppTx {
  return 'objectStore' in x;
}

function idOf(raw: unknown): string {
  return raw !== null && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string' ? raw.id : 'unknown';
}

function parse(id: string, raw: unknown): TargetPhoto {
  const parsed = TargetPhoto.safeParse(raw);
  if (!parsed.success) throw new CorruptRecordError('photos', id);
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

export async function listPhotosBySession(dbOrTx: Executor, sessionId: string): Promise<TargetPhoto[]> {
  let raws: unknown[];
  if (isTx(dbOrTx)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = dbOrTx.objectStore('photos') as any;
    raws = await store.index('by-sessionId').getAll(sessionId);
  } else {
    raws = await dbOrTx.getAllFromIndex('photos', 'by-sessionId', sessionId);
  }
  return raws.map((raw) => parse(idOf(raw), raw));
}

/** Every photo in the database (the runner plans over all of them). */
export async function listPhotoRecords(dbOrTx: Executor): Promise<TargetPhoto[]> {
  const raws = isTx(dbOrTx) ? await dbOrTx.objectStore('photos').getAll() : await dbOrTx.getAll('photos');
  return raws.map((raw) => parse(idOf(raw), raw));
}
