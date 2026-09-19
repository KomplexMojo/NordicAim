// Reading every stored record as it actually is, for Diagnostics → "Your data".
//
// Added 2026-09-19 after the owner lost a day's session to one unreadable record: the session list threw,
// the home screen showed nothing, and there was no way to see that the data was still there or to get it
// out. Nothing here parses through a schema (that is the point) and nothing here writes or deletes.

import { CorruptRecordError } from './errors';
import type { AppDb } from './db';
import { BiathlonSession, upgradeSession } from '@/lib/domain/session';
import { TargetAnalysis } from '@/lib/domain/analysis';
import { TargetPhoto } from '@/lib/domain/photo';

export interface UnreadableReport {
  store: 'sessions' | 'photos' | 'analyses';
  id: string;
  reason: string;
}

export interface StoredDataReport {
  sessions: number;
  photos: number;
  analyses: number;
  blobs: number;
  unreadable: UnreadableReport[];
}

function idOf(raw: unknown): string {
  return raw !== null && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string' ? raw.id : 'unknown';
}

/** Counts per store, and every record the schema rejects with the reason (the field, from `CorruptRecordError`). */
export async function storedDataReport(db: AppDb): Promise<StoredDataReport> {
  const [sessions, photos, analyses, blobKeys] = await Promise.all([
    db.getAll('sessions') as Promise<unknown[]>,
    db.getAll('photos') as Promise<unknown[]>,
    db.getAll('analyses') as Promise<unknown[]>,
    db.getAllKeys('blobs') as Promise<unknown[]>,
  ]);

  const unreadable: UnreadableReport[] = [];
  for (const raw of sessions) {
    const parsed = BiathlonSession.safeParse(upgradeSession(raw));
    if (!parsed.success) {
      unreadable.push({ store: 'sessions', id: idOf(raw), reason: new CorruptRecordError('sessions', idOf(raw), parsed.error).message });
    }
  }
  for (const raw of photos) {
    const parsed = TargetPhoto.safeParse(raw);
    if (!parsed.success) {
      unreadable.push({ store: 'photos', id: idOf(raw), reason: new CorruptRecordError('photos', idOf(raw), parsed.error).message });
    }
  }
  for (const raw of analyses) {
    const parsed = TargetAnalysis.safeParse(raw);
    if (!parsed.success) {
      unreadable.push({ store: 'analyses', id: idOf(raw), reason: new CorruptRecordError('analyses', idOf(raw), parsed.error).message });
    }
  }

  return { sessions: sessions.length, photos: photos.length, analyses: analyses.length, blobs: blobKeys.length, unreadable };
}

/**
 * Every record exactly as stored, as JSON: sessions, photos, analyses and settings, readable or not, plus
 * the blob keys (the images themselves are far too large and are not included). Never leaves the phone
 * unless the owner shares the file.
 */
export async function exportAllRecords(db: AppDb): Promise<string> {
  const [sessions, photos, analyses, settings, blobKeys] = await Promise.all([
    db.getAll('sessions') as Promise<unknown[]>,
    db.getAll('photos') as Promise<unknown[]>,
    db.getAll('analyses') as Promise<unknown[]>,
    db.getAll('settings') as Promise<unknown[]>,
    db.getAllKeys('blobs') as Promise<unknown[]>,
  ]);

  return JSON.stringify(
    {
      about: 'Nordic Aim data export. Records exactly as stored; images are not included (blob keys only).',
      exportedAt: new Date().toISOString(),
      sessions,
      photos,
      analyses,
      settings,
      blobKeys,
    },
    null,
    1,
  );
}
