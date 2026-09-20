// backup.md §3: nothing is trusted until the whole file verifies.

import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, base64ToBytes, sha256Hex, type BackupFile } from './format';

export interface VerifiedBackup {
  file: BackupFile;
  /** Decoded image bytes by key, already checked against the manifest. */
  bytes: Map<string, Uint8Array>;
}

export type VerifyResult = { ok: true; backup: VerifiedBackup } | { ok: false; problem: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

export async function verifyBackup(text: string): Promise<VerifyResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'This is not a complete Nordic Aim backup: the file is cut short or damaged.' };
  }
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, problem: 'This is not a Nordic Aim backup file.' };
  if (raw.formatVersion !== BACKUP_FORMAT_VERSION) {
    return { ok: false, problem: `This backup is format version ${String(raw.formatVersion)}; this app reads version ${BACKUP_FORMAT_VERSION}.` };
  }
  const { manifest, records, blobs } = raw as Record<string, unknown>;
  if (!isRecord(manifest) || !isRecord(records) || !Array.isArray(blobs)) return { ok: false, problem: 'The backup is missing its manifest, records or images.' };
  const counts = manifest.counts as Record<string, number> | undefined;
  const listed = manifest.blobs as Array<{ key: string; sha256: string; sizeBytes: number }> | undefined;
  if (!isRecord(counts) || !Array.isArray(listed)) return { ok: false, problem: 'The backup manifest is unreadable.' };

  for (const store of ['sessions', 'photos', 'analyses', 'settings'] as const) {
    const list = records[store];
    if (!Array.isArray(list)) return { ok: false, problem: `The backup has no ${store} list.` };
    if (list.length !== counts[store]) {
      return { ok: false, problem: `The manifest lists ${String(counts[store])} ${store} but the file holds ${list.length}.` };
    }
  }
  if (blobs.length !== counts.blobs || listed.length !== blobs.length) {
    return { ok: false, problem: `The manifest lists ${String(counts.blobs)} images but the file holds ${blobs.length}.` };
  }

  const expected = new Map(listed.map((b) => [b.key, b]));
  const bytes = new Map<string, Uint8Array>();
  for (const entry of blobs as Array<Record<string, unknown>>) {
    const key = entry.key;
    if (typeof key !== 'string' || typeof entry.base64 !== 'string') return { ok: false, problem: 'An image entry in the backup is malformed.' };
    const want = expected.get(key);
    if (want === undefined) return { ok: false, problem: `Image ${key} is in the file but not in the manifest.` };
    let decoded: Uint8Array;
    try {
      decoded = base64ToBytes(entry.base64);
    } catch {
      return { ok: false, problem: `Image ${key} could not be decoded.` };
    }
    if (decoded.byteLength !== want.sizeBytes) return { ok: false, problem: `Image ${key} is ${decoded.byteLength} bytes; the manifest says ${want.sizeBytes}.` };
    if ((await sha256Hex(decoded)) !== want.sha256) return { ok: false, problem: `Image ${key} does not match its checksum: the file was changed or damaged.` };
    bytes.set(key, decoded);
  }
  return { ok: true, backup: { file: raw as unknown as BackupFile, bytes } };
}
