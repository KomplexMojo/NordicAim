// backup.md §2: read every store as it is stored and write one backup file. Reads only; nothing is changed here.

import type { AppDb } from '@/lib/store/db';

import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, bytesToBase64, sha256Hex, type BackupBlob, type BackupManifest } from './format';

function str(raw: unknown, key: string): string | null {
  return raw !== null && typeof raw === 'object' && key in raw && typeof (raw as Record<string, unknown>)[key] === 'string'
    ? ((raw as Record<string, string>)[key] as string)
    : null;
}

export interface CreatedBackup {
  blob: Blob;
  manifest: BackupManifest;
}

export async function createBackup(db: AppDb, opts: { appBuild: string; nowIso: string }): Promise<CreatedBackup> {
  // All reads happen before anything is built; they are plain reads, each its own transaction.
  const [sessions, photos, analyses, settings, keys] = await Promise.all([
    db.getAll('sessions') as Promise<unknown[]>,
    db.getAll('photos') as Promise<unknown[]>,
    db.getAll('analyses') as Promise<unknown[]>,
    db.getAll('settings') as Promise<unknown[]>,
    db.getAllKeys('blobs') as Promise<string[]>,
  ]);

  const blobs: BackupBlob[] = [];
  const blobManifest: BackupManifest['blobs'] = [];
  for (const key of keys) {
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
  };

  // Written as parts, so the images are never joined into one enormous string.
  const parts: string[] = [
    `{"format":${JSON.stringify(BACKUP_FORMAT)},"formatVersion":${BACKUP_FORMAT_VERSION},`,
    `"manifest":${JSON.stringify(manifest)},`,
    `"records":${JSON.stringify({ sessions, photos, analyses, settings })},`,
    '"blobs":[',
  ];
  blobs.forEach((b, i) => parts.push((i === 0 ? '' : ',') + JSON.stringify(b)));
  parts.push(']}');
  return { blob: new Blob(parts, { type: 'application/json' }), manifest };
}
