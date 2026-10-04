// backup.md §2c (REV-143): a backup of chosen sessions holds exactly those sessions' records and blobs, plus the app-wide data.

import { describe, expect, it } from 'vitest';

import { createBackup } from '@/lib/backup/create';
import { backupFileName, readBackupText } from '@/lib/backup/format';
import { applyRestore, planRestore } from '@/lib/backup/restore';
import { blobInScope, scopeToSessions } from '@/lib/backup/scope';
import { verifyBackup } from '@/lib/backup/verify';
import { createSession } from '@/lib/services/sessions';
import { ingestPhoto } from '@/lib/services/ingest';
import type { AppDb } from '@/lib/store/db';

import { openTestDb } from '../../helpers/db';
import { emptyCategorization, jpegBlob, makeTestContext } from '../../helpers/fixtures';
import { stubImageTools } from '../../helpers/stub-image-tools';
import { stubRenderTools } from '../../helpers/stub-render-tools';

const TOOLS = { makeWorkingImages: stubImageTools().makeWorkingImages, svgToPng: stubRenderTools().svgToPng };
const NOW = '2026-09-30T12:00:00.000Z';

describe('blobInScope', () => {
  const photos = new Set(['p1']);
  const artifacts = new Set(['a1']);
  it("keeps a chosen session's photo, diagram and summary blobs, and every app-wide blob", () => {
    expect(blobInScope('photo:p1:original', photos, artifacts)).toBe(true);
    expect(blobInScope('diagram:p1:full-svg', photos, artifacts)).toBe(true);
    expect(blobInScope('artifact:a1:png', photos, artifacts)).toBe(true);
    expect(blobInScope('reference:precision:image', photos, artifacts)).toBe(true);
    expect(blobInScope('trends:t1:png', photos, artifacts)).toBe(true);
  });
  it("leaves out another session's", () => {
    expect(blobInScope('photo:p2:original', photos, artifacts)).toBe(false);
    expect(blobInScope('diagram:p2:cell-svg', photos, artifacts)).toBe(false);
    expect(blobInScope('artifact:a2:json', photos, artifacts)).toBe(false);
  });
});

describe('scopeToSessions', () => {
  const all = {
    sessions: [{ id: 's1', artifacts: [{ id: 'a1' }] }, { id: 's2', artifacts: [{ id: 'a2' }] }],
    photos: [{ id: 'p1', sessionId: 's1' }, { id: 'p2', sessionId: 's2' }],
    analyses: [{ photoId: 'p1' }, { photoId: 'p2' }],
    keys: ['photo:p1:original', 'photo:p2:original', 'artifact:a1:png', 'artifact:a2:png', 'reference:sighting:image'],
  };
  it('is everything with no session ids', () => {
    expect(scopeToSessions(all, undefined)).toBe(all);
  });
  it("keeps one session's records and blobs", () => {
    expect(scopeToSessions(all, ['s1'])).toEqual({
      sessions: [{ id: 's1', artifacts: [{ id: 'a1' }] }],
      photos: [{ id: 'p1', sessionId: 's1' }],
      analyses: [{ photoId: 'p1' }],
      keys: ['photo:p1:original', 'artifact:a1:png', 'reference:sighting:image'],
    });
  });
});

async function twoSessions() {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  const ids: { session: string; photo: string }[] = [];
  for (const name of ['Range A', 'Range B']) {
    const session = await createSession(ctx, { name });
    const photo = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob: jpegBlob(),
        origin: 'import',
        originalFilename: `${name}.jpg`,
        clientLocal: '2026-09-05T12:00:00',
        clientOffset: '-07:00',
        capture: null,
        categorization: emptyCategorization(),
      },
      stubImageTools(),
    );
    ids.push({ session: session.id, photo: photo.id });
  }
  return { db, ids };
}

async function keysOf(db: AppDb): Promise<string[]> {
  return ((await db.getAllKeys('blobs')) as string[]).sort();
}

describe('createBackup with chosen sessions', () => {
  it('holds only those sessions, says so in the manifest, verifies, and restores into an empty phone', async () => {
    const { db, ids } = await twoSessions();
    const [a, b] = ids as [{ session: string; photo: string }, { session: string; photo: string }];
    const made = await createBackup(db, { appBuild: 'test', nowIso: NOW, sessionIds: [a.session] });
    expect(made.manifest.scope).toEqual({ kind: 'sessions', sessionIds: [a.session] });
    expect(made.manifest.counts.sessions).toBe(1);
    expect(made.manifest.counts.photos).toBe(1);
    expect(made.manifest.sessions.map((s) => s.name)).toEqual(['Range A']);
    expect(made.manifest.blobs.every((bl) => !bl.key.includes(b.photo))).toBe(true);

    // Smaller than a full backup of both.
    const full = await createBackup(db, { appBuild: 'test', nowIso: NOW });
    expect(full.manifest.scope).toBeUndefined();
    expect(made.uncompressedBytes).toBeLessThan(full.uncompressedBytes);

    const verified = await verifyBackup(await readBackupText(made.blob));
    if (!verified.ok) throw new Error(verified.problem);
    const fresh = await openTestDb();
    await applyRestore(fresh, verified.backup, await planRestore(fresh, verified.backup), 'keep', TOOLS);
    expect(((await fresh.getAll('sessions')) as Array<{ id: string }>).map((s) => s.id)).toEqual([a.session]);
    expect((await keysOf(fresh)).every((k) => !k.includes(b.photo))).toBe(true);
    expect((await keysOf(fresh)).some((k) => k === `photo:${a.photo}:original`)).toBe(true);
    db.close();
    fresh.close();
  });
});

describe('backupFileName for chosen sessions', () => {
  it('ends with how many sessions it holds', () => {
    expect(backupFileName({ localDate: '2026-09-30', athleteName: 'Jane Doe', keyFingerprint: null, sessions: 1 })).toBe(
      'nordic-aim-backup-jane-doe-2026-09-30-1-session.json.gz',
    );
    expect(backupFileName({ localDate: '2026-09-30', athleteName: '', keyFingerprint: null, sessions: 3 })).toBe(
      'nordic-aim-backup-2026-09-30-3-sessions.json.gz',
    );
  });
});
