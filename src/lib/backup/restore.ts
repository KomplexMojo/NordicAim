// backup.md §4: compare a verified backup with what is on the phone, then write it in one transaction.

import type { AppDb, StoredBlob } from '@/lib/store/db';

import { sha256Hex } from './format';
import type { VerifiedBackup } from './verify';

export type Status = 'new' | 'same' | 'different';
export type ConflictPolicy = 'keep' | 'replace';

export interface StorePlan {
  new: number;
  same: number;
  different: number;
}

export interface RestorePlan {
  sessions: StorePlan;
  photos: StorePlan;
  analyses: StorePlan;
  settings: StorePlan;
  blobs: StorePlan;
  /** Per-item verdicts, so apply does not compare twice. */
  verdicts: Map<string, Status>;
}

const RECORD_STORES = ['sessions', 'photos', 'analyses', 'settings'] as const;
const KEY_OF: Record<(typeof RECORD_STORES)[number], string> = { sessions: 'id', photos: 'id', analyses: 'photoId', settings: 'key' };

/** Key order does not matter: two records are the same when their content is. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

function keyOf(store: (typeof RECORD_STORES)[number], record: unknown): string | null {
  const v = (record as Record<string, unknown> | null)?.[KEY_OF[store]];
  return typeof v === 'string' ? v : null;
}

const blank = (): StorePlan => ({ new: 0, same: 0, different: 0 });

export async function planRestore(db: AppDb, backup: VerifiedBackup): Promise<RestorePlan> {
  const verdicts = new Map<string, Status>();
  const plan: RestorePlan = { sessions: blank(), photos: blank(), analyses: blank(), settings: blank(), blobs: blank(), verdicts };

  for (const store of RECORD_STORES) {
    const existing = new Map<string, unknown>();
    for (const rec of (await db.getAll(store)) as unknown[]) {
      const k = keyOf(store, rec);
      if (k !== null) existing.set(k, rec);
    }
    for (const rec of backup.file.records[store]) {
      const k = keyOf(store, rec);
      if (k === null) continue;
      const have = existing.get(k);
      const status: Status = have === undefined ? 'new' : canonical(have) === canonical(rec) ? 'same' : 'different';
      verdicts.set(`${store}:${k}`, status);
      plan[store][status] += 1;
    }
  }

  for (const [key, bytes] of backup.bytes) {
    const have = await db.get('blobs', key);
    let status: Status = 'new';
    if (have !== undefined) status = (await sha256Hex(new Uint8Array(have.bytes))) === (await sha256Hex(bytes)) ? 'same' : 'different';
    verdicts.set(`blobs:${key}`, status);
    plan.blobs[status] += 1;
  }
  return plan;
}

export interface RestoreReport {
  written: number;
  skipped: number;
}

/** Everything is decoded first; the one transaction only awaits IndexedDB calls, and any failure aborts all of it. */
export async function applyRestore(db: AppDb, backup: VerifiedBackup, plan: RestorePlan, policy: ConflictPolicy): Promise<RestoreReport> {
  const wanted = (id: string): boolean => {
    const status = plan.verdicts.get(id);
    return status === 'new' || (status === 'different' && policy === 'replace');
  };

  const blobs: Array<[string, StoredBlob]> = [];
  for (const entry of backup.file.blobs) {
    if (!wanted(`blobs:${entry.key}`)) continue;
    const bytes = backup.bytes.get(entry.key)!;
    blobs.push([entry.key, { bytes: bytes.slice().buffer, contentType: entry.contentType, sizeBytes: entry.sizeBytes, createdAt: entry.createdAt }]);
  }
  const records: Array<[(typeof RECORD_STORES)[number], unknown]> = [];
  let skipped = 0;
  for (const store of RECORD_STORES) {
    for (const rec of backup.file.records[store]) {
      const k = keyOf(store, rec);
      if (k !== null && wanted(`${store}:${k}`)) records.push([store, rec]);
      else skipped += 1;
    }
  }
  skipped += backup.file.blobs.length - blobs.length;

  const tx = db.transaction(['sessions', 'photos', 'analyses', 'settings', 'blobs'], 'readwrite');
  try {
    for (const [store, rec] of records) await (tx.objectStore(store) as unknown as { put(v: unknown): Promise<unknown> }).put(rec);
    for (const [key, blob] of blobs) await tx.objectStore('blobs').put(blob, key);
    await tx.done;
  } catch (err) {
    tx.done.catch(() => undefined); // the abort below rejects `done`; the caller gets `err`
    try {
      tx.abort();
    } catch {
      // already finished or aborted
    }
    throw err;
  }
  return { written: records.length + blobs.length, skipped };
}
