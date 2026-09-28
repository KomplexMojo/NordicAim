import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createBackup } from '@/lib/backup/create';
import { backupFileName, fileNameSlug, readBackupText } from '@/lib/backup/format';
import { verifyBackup, verifyBackupFile } from '@/lib/backup/verify';
import { createSession } from '@/lib/services/sessions';
import { ingestPhoto } from '@/lib/services/ingest';

import { openTestDb } from '../../helpers/db';
import { emptyCategorization, makeTestContext } from '../../helpers/fixtures';
import { stubImageTools } from '../../helpers/stub-image-tools';

const NOW = '2026-09-27T12:00:00.000Z';

async function seededWithRealJpeg() {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  const session = await createSession(ctx, { name: 'Range day' });
  const jpeg = new Blob([readFileSync('fixtures/reference/exif-sample.jpg')], { type: 'image/jpeg' });
  await ingestPhoto(
    ctx,
    {
      sessionId: session.id,
      blob: jpeg,
      origin: 'import',
      originalFilename: 'a.jpg',
      clientLocal: '2026-09-05T12:00:00',
      clientOffset: '-07:00',
      capture: null,
      categorization: emptyCategorization(),
    },
    stubImageTools(),
  );
  return db;
}

describe('backup compression (backup.md §2a)', () => {
  it('writes a gzip file that restores, and recovers most of the base64 overhead', async () => {
    const db = await seededWithRealJpeg();
    const made = await createBackup(db, { appBuild: 'test', nowIso: NOW });
    const head = new Uint8Array(await made.blob.slice(0, 2).arrayBuffer());
    expect([head[0], head[1]]).toEqual([0x1f, 0x8b]);
    expect(made.blob.type).toBe('application/gzip');

    const imageBytes = made.manifest.blobs.reduce((n, b) => n + b.sizeBytes, 0);
    // base64 alone is 4/3 of the image bytes; compressed, the file is close to the images' own size.
    expect(made.uncompressedBytes).toBeGreaterThan(imageBytes * 1.33);
    expect(made.blob.size).toBeLessThan(imageBytes * 1.1);

    const verified = await verifyBackupFile(made.blob);
    if (!verified.ok) throw new Error(verified.problem);
    expect(verified.backup.file.manifest.counts.photos).toBe(1);
    db.close();
  });

  it('still reads a plain JSON backup (made before compression, or expanded by the Files app)', async () => {
    const db = await seededWithRealJpeg();
    const text = await readBackupText((await createBackup(db, { appBuild: 'test', nowIso: NOW })).blob);
    const verified = await verifyBackupFile(new Blob([text], { type: 'application/json' }));
    expect(verified.ok).toBe(true);
    expect((await verifyBackup(text)).ok).toBe(true);
    db.close();
  });

  it('refuses a cut-off compressed file as damaged', async () => {
    const db = await seededWithRealJpeg();
    const made = await createBackup(db, { appBuild: 'test', nowIso: NOW });
    const cut = await verifyBackupFile(made.blob.slice(0, made.blob.size - 100));
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.problem).toMatch(/cut short|damaged/);
    db.close();
  });
});

describe('backup file name (backup.md §2)', () => {
  it('carries the athlete, the key fingerprint and the date', () => {
    expect(backupFileName({ localDate: '2026-09-27', athleteName: 'Jane Doe', keyFingerprint: '3FA91C07' })).toBe(
      'nordic-aim-backup-jane-doe-3FA91C07-2026-09-27.json.gz',
    );
  });
  it('leaves out what is not set', () => {
    expect(backupFileName({ localDate: '2026-09-27', athleteName: '', keyFingerprint: null })).toBe('nordic-aim-backup-2026-09-27.json.gz');
    expect(backupFileName({ localDate: '2026-09-27', athleteName: '  !!  ', keyFingerprint: 'not-hex' })).toBe('nordic-aim-backup-2026-09-27.json.gz');
    expect(backupFileName({ localDate: '2026-09-27', athleteName: '', keyFingerprint: '3fa91c07' })).toBe('nordic-aim-backup-3FA91C07-2026-09-27.json.gz');
  });
  it('spells Nordic and accented letters in plain ASCII and keeps names short', () => {
    expect(fileNameSlug('Bjørn Dæhlie')).toBe('bjorn-daehlie');
    expect(fileNameSlug('Åsa Ångström-Öberg')).toBe('asa-angstrom-oberg');
    expect(fileNameSlug('Þóra / Ðoe')).toBe('thora-doe');
    expect(fileNameSlug('A very long athlete name that keeps going')).toBe('a-very-long-athlete-name-that');
  });
});
