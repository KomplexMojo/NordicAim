import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

import { createSession, getSession } from '@/lib/services/sessions';
import { ingestPhoto, UnsupportedFormatError } from '@/lib/services/ingest';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';

import { openTestDb } from '../../helpers/db';
import { completeCategorization, emptyCategorization, jpegBlob, makeTestContext } from '../../helpers/fixtures';
import { stubImageTools } from '../../helpers/stub-image-tools';

const FIXTURES = new URL('../../../fixtures/reference/', import.meta.url);

describe('ingestPhoto', () => {
  it('stores captureTime with source client-clock for camera-overlay origin', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob: jpegBlob(),
        origin: 'camera-overlay',
        originalFilename: null,
        clientLocal: '2026-09-05T12:00:00',
        clientOffset: '-07:00',
        capture: null,
        categorization: emptyCategorization(),
      },
      stubImageTools(),
    );
    expect(photo.captureTime.source).toBe('client-clock');
    expect(photo.captureTime.local).toBe('2026-09-05T12:00:00');
    expect(photo.captureTime.offset).toBe('-07:00');
    db.close();
  });

  it('sets initial analysis stageA pending, calibration null', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob: jpegBlob(),
        origin: 'import',
        originalFilename: null,
        clientLocal: '2026-09-05T12:00:00',
        clientOffset: '-07:00',
        capture: null,
        categorization: emptyCategorization(),
      },
      stubImageTools(),
    );
    const analysis = await getAnalysisRecord(db, photo.id);
    expect(analysis?.pipeline.stageA).toBe('pending');
    expect(analysis?.calibration).toBeNull();
    db.close();
  });

  it('status is processing for complete categorization', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob: jpegBlob(),
        origin: 'import',
        originalFilename: null,
        clientLocal: '2026-09-05T12:00:00',
        clientOffset: '-07:00',
        capture: null,
        categorization: completeCategorization(),
      },
      stubImageTools(),
    );
    expect(photo.status).toBe('processing');
    db.close();
  });

  it('status is needs-metadata for no categorization', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob: jpegBlob(),
        origin: 'import',
        originalFilename: null,
        clientLocal: '2026-09-05T12:00:00',
        clientOffset: '-07:00',
        capture: null,
        categorization: emptyCategorization(),
      },
      stubImageTools(),
    );
    expect(photo.status).toBe('needs-metadata');
    db.close();
  });

  it('appends the photo id to session.photoIds and calls notify() once', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const notifySpy = vi.spyOn(pipelineHooks, 'notify');
    notifySpy.mockClear();

    const photo = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob: jpegBlob(),
        origin: 'import',
        originalFilename: null,
        clientLocal: '2026-09-05T12:00:00',
        clientOffset: '-07:00',
        capture: null,
        categorization: emptyCategorization(),
      },
      stubImageTools(),
    );

    const updated = await getSession(ctx, session.id);
    expect(updated?.photoIds).toEqual([photo.id]);
    expect(notifySpy).toHaveBeenCalledTimes(1);
    notifySpy.mockRestore();
    db.close();
  });

  it('exif-sample.jpg as origin import -> source exif, utc matches, lighting daylight 0.9', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const buf = await readFile(new URL('exif-sample.jpg', FIXTURES));
    const blob = new Blob([buf], { type: 'image/jpeg' });
    const photo = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob,
        origin: 'import',
        originalFilename: 'exif-sample.jpg',
        clientLocal: '2026-09-05T12:00:00',
        clientOffset: '-07:00',
        capture: null,
        categorization: emptyCategorization(),
      },
      stubImageTools(),
    );
    expect(photo.captureTime.source).toBe('exif');
    expect(photo.captureTime.utc).toBe('2026-09-05T23:56:03.000Z');
    expect(photo.lightingSuggestion.label).toBe('daylight');
    expect(photo.lightingSuggestion.confidence).toBe(0.9);
    expect(photo.lighting).toBe('daylight');
    expect(photo.lightingConfirmed).toBe(false);
    db.close();
  });

  it('camera-overlay without EXIF at 16:56 local with non-warm stats -> client-clock, daylight 0.5', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob: jpegBlob(),
        origin: 'camera-overlay',
        originalFilename: null,
        clientLocal: '2026-09-05T16:56:00',
        clientOffset: '-07:00',
        capture: null,
        categorization: emptyCategorization(),
      },
      stubImageTools(), // default toRgba is a flat neutral-gray image (not warm)
    );
    expect(photo.captureTime.source).toBe('client-clock');
    expect(photo.lightingSuggestion.label).toBe('daylight');
    expect(photo.lightingSuggestion.confidence).toBe(0.5);
    expect(photo.lighting).toBe('daylight');
    db.close();
  });

  it('throws UnsupportedFormatError for random bytes', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], { type: 'application/octet-stream' });
    await expect(
      ingestPhoto(
        ctx,
        {
          sessionId: session.id,
          blob,
          origin: 'import',
          originalFilename: null,
          clientLocal: '2026-09-05T12:00:00',
          clientOffset: '-07:00',
          capture: null,
          categorization: emptyCategorization(),
        },
        stubImageTools(),
      ),
    ).rejects.toThrow(UnsupportedFormatError);
    db.close();
  });
});
