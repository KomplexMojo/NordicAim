import type { AppDb } from './db';

const KEY = 'provenance';

/** REV-100: the derived provenance key as base64, or null when none is set on this phone. */
export async function getProvenanceKey(db: AppDb): Promise<string | null> {
  return (await db.get('secrets', KEY))?.keyB64 ?? null;
}

export async function putProvenanceKey(db: AppDb, keyB64: string): Promise<void> {
  await db.put('secrets', { key: KEY, keyB64 });
}

export async function clearProvenanceKey(db: AppDb): Promise<void> {
  await db.delete('secrets', KEY);
}
