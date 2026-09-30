// backup.md §2: read every store as it is stored and write one backup file. Reads only; nothing is changed here.

import type { AppDb } from '@/lib/store/db';

import { rebuildEntries } from './rebuild';
import { scopeToSessions } from './scope';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, bytesToBase64, gzipBlob, sha256Hex, type BackupBlob, type BackupManifest, type BackupPreference } from './format';

function str(raw: unknown, key: string): string | null {
  return raw !== null && typeof raw === 'object' && key in raw && typeof (raw as Record<string, unknown>)[key] === 'string'
    ? ((raw as Record<string, string>)[key] as string)
    : null;
}

export interface CreatedBackup {
  /** The file as written: the JSON, gzip-compressed (§2a). */
  blob: Blob;
  /** The size of the JSON before compression, so Settings can say what compression saved. */
  uncompressedBytes: number;
  manifest: BackupManifest;
}

export async function createBackup(
  db: AppDb,
  opts: {
    appBuild: string;
    nowIso: string;
    preferences?: BackupPreference[];
    /** §2c (REV-143): back up only these sessions (and the app-wide data). Absent: everything. */
    sessionIds?: string[];
  },
): Promise<CreatedBackup> {
  // All reads happen before anything is built; they are plain reads, each its own transaction.
  const [allSessions, allPhotos, allAnalyses, settings, allKeys] = await Promise.all([
    db.getAll('sessions') as Promise<unknown[]>,
    db.getAll('photos') as Promise<unknown[]>,
    db.getAll('analyses') as Promise<unknown[]>,
    db.getAll('settings') as Promise<unknown[]>,
    db.getAllKeys('blobs') as Promise<string[]>,
  ]);
  const { sessions, photos, analyses, keys } = scopeToSessions(
    { sessions: allSessions, photos: allPhotos, analyses: allAnalyses, keys: allKeys },
    opts.sessionIds,
  );

  // §2b: a photo's working copy and thumbnail, and a diagram's PNG, are made again on restore from the original and the SVG.
  const rebuild = rebuildEntries(keys);
  const leftOut = new Set(rebuild.map((r) => r.key));

  const blobs: BackupBlob[] = [];
  const blobManifest: BackupManifest['blobs'] = [];
  for (const key of keys) {
    if (leftOut.has(key)) continue;
    const stored = await db.get('blobs', key);
    if (stored === undefined) continue;
    const bytes = new Uint8Array(stored.bytes);
    blobManifest.push({ key, sha256: await sha256Hex(bytes), sizeBytes: bytes.byteLength });
    blobs.push({
      key,
      contentType: stored.contentType,
      sizeBytes: bytes.byteLength,
      createdAt: stored.createdAt,
      base64: bytesToBase64(bytes),
    });
  }

  const photosBySession = new Map<string, number>();
  for (const p of photos) {
    const sid = str(p, 'sessionId');
    if (sid !== null) photosBySession.set(sid, (photosBySession.get(sid) ?? 0) + 1);
  }

  const manifest: BackupManifest = {
    appBuild: opts.appBuild,
    createdAt: opts.nowIso,
    counts: { sessions: sessions.length, photos: photos.length, analyses: analyses.length, settings: settings.length, blobs: blobs.length },
    sessions: sessions.map((s) => {
      const id = str(s, 'id') ?? 'unknown';
      return { id, name: str(s, 'name'), sessionDate: str(s, 'sessionDate'), photos: photosBySession.get(id) ?? 0 };
    }),
    blobs: blobManifest,
    rebuild,
    ...(opts.sessionIds === undefined ? {} : { scope: { kind: 'sessions' as const, sessionIds: sessions.flatMap((s) => (str(s, 'id') === null ? [] : [str(s, 'id')!])) } }),
  };

  // Written as parts, so the images are never joined into one enormous string.
  const parts: string[] = [
    `{"format":${JSON.stringify(BACKUP_FORMAT)},"formatVersion":${BACKUP_FORMAT_VERSION},`,
    `"manifest":${JSON.stringify(manifest)},`,
    `"records":${JSON.stringify({ sessions, photos, analyses, settings })},`,
    '"blobs":[',
  ];
  blobs.forEach((b, i) => parts.push((i === 0 ? '' : ',') + JSON.stringify(b)));
  parts.push(`],"preferences":${JSON.stringify(opts.preferences ?? [])}}`);
  const json = new Blob(parts, { type: 'application/json' });
  return { blob: await gzipBlob(json), uncompressedBytes: json.size, manifest };
}
