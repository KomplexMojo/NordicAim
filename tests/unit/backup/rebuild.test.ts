import { describe, expect, it } from 'vitest';

import { createBackup } from '@/lib/backup/create';
import { bytesToBase64, readBackupText, sha256Hex } from '@/lib/backup/format';
import { RebuildError, rebuildEntries } from '@/lib/backup/rebuild';
import { applyRestore, planRestore } from '@/lib/backup/restore';
import { verifyBackup } from '@/lib/backup/verify';
import { createSession } from '@/lib/services/sessions';
import { ingestPhoto } from '@/lib/services/ingest';
import { diagramFullPngKey, diagramFullSvgKey, photoOriginalKey, photoThumbKey, photoWorkingKey } from '@/lib/store/blob-keys';
import type { AppDb } from '@/lib/store/db';

import { openTestDb } from '../../helpers/db';
import { emptyCategorization, jpegBlob, makeTestContext } from '../../helpers/fixtures';
import { stubImageTools } from '../../helpers/stub-image-tools';
import { stubRenderTools } from '../../helpers/stub-render-tools';

const NOW = '2026-09-27T12:00:00.000Z';

async function seeded() {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  const session = await createSession(ctx, { name: 'Range day' });
  const photo = await ingestPhoto(
    ctx,
    {
      sessionId: session.id,
      blob: jpegBlob(),
      origin: 'import',
      originalFilename: 'a.jpg',
      clientLocal: '2026-09-05T12:00:00',
      clientOffset: '-07:00',
      capture: null,
      categorization: emptyCategorization(),
    },
    stubImageTools(),
  );
  // A diagram as Stage B stores it: the SVG, and the PNG drawn from it.
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
  await db.put('blobs', { bytes: svg.slice().buffer, contentType: 'image/svg+xml', sizeBytes: svg.byteLength, createdAt: NOW }, diagramFullSvgKey(photo.id));
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  await db.put('blobs', { bytes: png.slice().buffer, contentType: 'image/png', sizeBytes: 4, createdAt: NOW }, diagramFullPngKey(photo.id));
  return { db, photo };
}

function tools(overrides: Partial<ReturnType<typeof stubImageTools>> = {}) {
  const image = stubImageTools(overrides);
  const render = stubRenderTools();
  const calls = { images: 0 };
  return {
    render,
    calls,
    tools: {
      makeWorkingImages: (blob: Blob, format: Parameters<typeof image.makeWorkingImages>[1]) => {
        calls.images += 1;
        return image.makeWorkingImages(blob, format);
      },
      svgToPng: render.svgToPng,
    },
  };
}

async function verified(db: AppDb) {
  const text = await readBackupText((await createBackup(db, { appBuild: 'test', nowIso: NOW })).blob);
  const result = await verifyBackup(text);
  if (!result.ok) throw new Error(result.problem);
  return { text, backup: result.backup };
}

async function blobKeys(db: AppDb): Promise<string[]> {
  return ((await db.getAllKeys('blobs')) as string[]).sort();
}

describe('images a backup leaves out and a restore makes again (backup.md §2b, REV-126)', () => {
  it('leaves out the working copy, the thumbnail and the diagram PNG, listing each with its source', async () => {
    const { db, photo } = await seeded();
    const { backup } = await verified(db);
    expect(backup.file.formatVersion).toBe(2);
    expect(backup.file.blobs.map((b) => b.key).sort()).toEqual([diagramFullSvgKey(photo.id), photoOriginalKey(photo.id)].sort());
    expect(backup.file.manifest.rebuild).toEqual(
      expect.arrayContaining([
        { key: photoWorkingKey(photo.id), from: photoOriginalKey(photo.id) },
        { key: photoThumbKey(photo.id), from: photoOriginalKey(photo.id) },
        { key: diagramFullPngKey(photo.id), from: diagramFullSvgKey(photo.id) },
      ]),
    );
    db.close();
  });

  it('only leaves out an image whose source is in the file', () => {
    expect(rebuildEntries(['photo:a:working', 'photo:a:thumb', 'diagram:a:full-png'])).toEqual([]);
    expect(rebuildEntries(['photo:a:original', 'photo:a:working', 'artifact:x:png', 'reference:sighting:image'])).toEqual([
      { key: 'photo:a:working', from: 'photo:a:original' },
    ]);
  });

  it('makes them again on restore into an empty phone, the diagram PNG at its full size', async () => {
    const { db, photo } = await seeded();
    const { backup } = await verified(db);
    const fresh = await openTestDb();
    const t = tools();
    const report = await applyRestore(fresh, backup, await planRestore(fresh, backup), 'keep', t.tools);
    expect(report.rebuilt).toBe(3);
    expect(t.calls.images).toBe(1);
    expect(t.render.calls).toEqual([{ svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', widthPx: 1500, heightPx: 1700 }]);
    expect(await blobKeys(fresh)).toEqual(await blobKeys(db));
    expect((await fresh.get('blobs', photoWorkingKey(photo.id)))!).toMatchObject({ contentType: 'image/jpeg', sizeBytes: 3 });
    db.close();
    fresh.close();
  });

  it('makes nothing when the phone already has everything, and only what it lost otherwise', async () => {
    const { db, photo } = await seeded();
    const { backup } = await verified(db);
    const t = tools();
    expect((await applyRestore(db, backup, await planRestore(db, backup), 'keep', t.tools)).rebuilt).toBe(0);
    expect(t.calls.images).toBe(0);

    await db.delete('blobs', photoThumbKey(photo.id));
    const report = await applyRestore(db, backup, await planRestore(db, backup), 'keep', t.tools);
    expect(report.rebuilt).toBe(1);
    expect(t.render.calls).toHaveLength(0);
    expect(await db.get('blobs', photoThumbKey(photo.id))).toBeDefined();
    db.close();
  });

  it('writes nothing when a working copy comes out at another size, or the photo cannot be opened', async () => {
    const { db } = await seeded();
    const { backup } = await verified(db);
    const fresh = await openTestDb();
    const plan = await planRestore(fresh, backup);

    const resized = tools({
      async makeWorkingImages() {
        return {
          working: new Blob([new Uint8Array([1])]),
          thumb: new Blob([new Uint8Array([2])]),
          originalSize: { widthPx: 1000, heightPx: 1600 },
          workingSize: { widthPx: 1000, heightPx: 1600, scaleFromOriginal: 1 },
        };
      },
    });
    await expect(applyRestore(fresh, backup, plan, 'keep', resized.tools)).rejects.toThrow(RebuildError);
    expect(await fresh.count('sessions')).toBe(0);
    expect(await fresh.count('blobs')).toBe(0);

    const undecodable = tools({
      async makeWorkingImages() {
        throw new Error("HEIC photos can't be opened in this browser");
      },
    });
    await expect(applyRestore(fresh, backup, plan, 'keep', undecodable.tools)).rejects.toThrow(/Safari on the iPhone/);
    await expect(applyRestore(fresh, backup, plan, 'keep')).rejects.toThrow();
    expect(await fresh.count('blobs')).toBe(0);
    db.close();
    fresh.close();
  });

  it('refuses a file whose rebuild list names an image it cannot make or whose source is missing', async () => {
    const { db, photo } = await seeded();
    const { text } = await verified(db);

    const foreign = JSON.parse(text);
    foreign.manifest.rebuild.push({ key: 'artifact:x:png', from: photoOriginalKey(photo.id) });
    const refused = await verifyBackup(JSON.stringify(foreign));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.problem).toMatch(/cannot make/);

    const orphan = JSON.parse(text);
    orphan.manifest.rebuild.push({ key: 'photo:other:working', from: 'photo:other:original' });
    const missing = await verifyBackup(JSON.stringify(orphan));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.problem).toMatch(/is missing/);
    db.close();
  });

  it('still restores a version 1 file, which carries every image', async () => {
    const { db, photo } = await seeded();
    const v1 = JSON.parse((await verified(db)).text);
    v1.formatVersion = 1;
    delete v1.manifest.rebuild;
    for (const key of [photoWorkingKey(photo.id), photoThumbKey(photo.id), diagramFullPngKey(photo.id)]) {
      const b = (await db.get('blobs', key))!;
      const bytes = new Uint8Array(b.bytes);
      v1.blobs.push({ key, contentType: b.contentType, sizeBytes: b.sizeBytes, createdAt: b.createdAt, base64: bytesToBase64(bytes) });
      v1.manifest.blobs.push({ key, sha256: await sha256Hex(bytes), sizeBytes: b.sizeBytes });
    }
    v1.manifest.counts.blobs = v1.blobs.length;
    const result = await verifyBackup(JSON.stringify(v1));
    if (!result.ok) throw new Error(result.problem);
    const fresh = await openTestDb();
    const report = await applyRestore(fresh, result.backup, await planRestore(fresh, result.backup), 'keep');
    expect(report.rebuilt).toBe(0);
    expect(await blobKeys(fresh)).toEqual(await blobKeys(db));
    db.close();
    fresh.close();
  });
});
