import type { AppDb, AppTx, StoredBlob } from './db';
import { CorruptRecordError } from './errors';

type Executor = AppDb | AppTx;

function isTx(x: Executor): x is AppTx {
  return 'objectStore' in x;
}

function parse(key: string, raw: unknown): StoredBlob {
  if (
    raw === null ||
    typeof raw !== 'object' ||
    !(raw as { bytes?: unknown }).bytes ||
    !((raw as { bytes: unknown }).bytes instanceof ArrayBuffer) ||
    typeof (raw as { contentType?: unknown }).contentType !== 'string' ||
    typeof (raw as { sizeBytes?: unknown }).sizeBytes !== 'number' ||
    typeof (raw as { createdAt?: unknown }).createdAt !== 'string'
  ) {
    throw new CorruptRecordError('blobs', key);
  }
  return raw as StoredBlob;
}

/** Prepare `record.bytes` (e.g. `await blob.arrayBuffer()`) before calling — never await inside a transaction. */
export async function putBlob(dbOrTx: Executor, key: string, record: StoredBlob): Promise<void> {
  if (isTx(dbOrTx)) await dbOrTx.objectStore('blobs').put(record, key);
  else await dbOrTx.put('blobs', record, key);
}

export async function getBlob(dbOrTx: Executor, key: string): Promise<Blob | null> {
  const raw = isTx(dbOrTx) ? await dbOrTx.objectStore('blobs').get(key) : await dbOrTx.get('blobs', key);
  if (raw == null) return null;
  const stored = parse(key, raw);
  return new Blob([stored.bytes], { type: stored.contentType });
}

export async function deleteBlob(dbOrTx: Executor, key: string): Promise<void> {
  if (isTx(dbOrTx)) await dbOrTx.objectStore('blobs').delete(key);
  else await dbOrTx.delete('blobs', key);
}

export async function deleteByPrefix(dbOrTx: Executor, prefix: string): Promise<void> {
  const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
  if (isTx(dbOrTx)) {
    const store = dbOrTx.objectStore('blobs');
    let cursor = await store.openCursor(range);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    return;
  }
  const keys = await dbOrTx.getAllKeys('blobs', range);
  const tx = dbOrTx.transaction('blobs', 'readwrite');
  await Promise.all(keys.map((key) => tx.objectStore('blobs').delete(key)));
  await tx.done;
}
