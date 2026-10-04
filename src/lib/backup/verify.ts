// backup.md §3: nothing is trusted until the whole file verifies.

import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupUnreadableError,
  READABLE_FORMAT_VERSIONS,
  PREFERENCE_PREFIX,
  base64ToBytes,
  readBackupText,
  sha256Hex,
  type BackupFile,
  type BackupPreference,
} from './format';
import { rebuildSource } from './rebuild';
import { restoreProblem } from './safety';

export interface VerifiedBackup {
  file: BackupFile;
  /** Decoded image bytes by key, already checked against the manifest. */
  bytes: Map<string, Uint8Array>;
}

export type VerifyResult = { ok: true; backup: VerifiedBackup } | { ok: false; problem: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/** §2a: a chosen file, gzip-compressed or plain JSON, read and then verified. */
export async function verifyBackupFile(file: Blob): Promise<VerifyResult> {
  let text: string;
  try {
    text = await readBackupText(file);
  } catch (err) {
    if (err instanceof BackupUnreadableError) return { ok: false, problem: err.message };
    throw err;
  }
  return verifyBackup(text);
}

export async function verifyBackup(text: string): Promise<VerifyResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: new BackupUnreadableError().message };
  }
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, problem: 'This is not a NordicAim backup file.' };
  if (typeof raw.formatVersion !== 'number' || !READABLE_FORMAT_VERSIONS.includes(raw.formatVersion)) {
    return { ok: false, problem: `This backup is format version ${String(raw.formatVersion)}; this app reads versions up to ${BACKUP_FORMAT_VERSION}.` };
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
  // §2b: every left-out image must be one a restore knows how to make, from an image that is in the file.
  const rebuild = manifest.rebuild ?? [];
  if (!Array.isArray(rebuild)) return { ok: false, problem: 'The backup manifest is unreadable.' };
  for (const r of rebuild as unknown[]) {
    if (!isRecord(r) || typeof r.key !== 'string' || typeof r.from !== 'string' || rebuildSource(r.key) !== r.from || expected.has(r.key)) {
      return { ok: false, problem: 'The backup lists an image to rebuild that this app cannot make.' };
    }
    if (!bytes.has(r.from)) return { ok: false, problem: `Image ${r.from} is missing, so ${r.key} cannot be made again.` };
  }
  // Issue #45: only types the app stores, no active content in a diagram SVG, and settings the app can read.
  const unsafe = restoreProblem({ blobs: blobs as Array<{ key: string; contentType: unknown }>, settings: records.settings as unknown[] }, bytes);
  if (unsafe !== null) return { ok: false, problem: unsafe };
  // REV-115: preferences are optional (older backups have none); only well-formed `asa.` entries are kept.
  const prefs: BackupPreference[] = Array.isArray(raw.preferences)
    ? (raw.preferences as unknown[]).flatMap((p) =>
        isRecord(p) && typeof p.key === 'string' && p.key.startsWith(PREFERENCE_PREFIX) && typeof p.value === 'string' ? [{ key: p.key, value: p.value }] : [],
      )
    : [];
  // leaderboard.md §8: the board is optional and read loosely here; each submission is checked on its own when restored.
  const rawBoard = isRecord(raw.board) ? raw.board : null;
  const board =
    rawBoard === null
      ? undefined
      : { submissions: Array.isArray(rawBoard.submissions) ? rawBoard.submissions : [], challenges: Array.isArray(rawBoard.challenges) ? rawBoard.challenges : [] };
  // goals.md §2a: the goal log is optional and read loosely here too; each entry is checked when restored.
  const goals = isRecord(raw.goals) && Array.isArray(raw.goals.entries) ? { entries: raw.goals.entries } : undefined;
  const file = { ...(raw as unknown as BackupFile), preferences: prefs };
  delete file.board;
  delete file.goals;
  return { ok: true, backup: { file: { ...file, ...(board === undefined ? {} : { board }), ...(goals === undefined ? {} : { goals }) }, bytes } };
}
