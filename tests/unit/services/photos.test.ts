import { describe, expect, it, vi } from 'vitest';

import { createSession, getSession } from '@/lib/services/sessions';
import { ingestPhoto } from '@/lib/services/ingest';
import { deletePhoto, requestAnalysis, updatePhotoMetadata } from '@/lib/services/photos';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import { onPipelineChanged } from '@/lib/pipeline/events';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { getBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord } from '@/lib/store/photos-repo';
import { photoOriginalKey } from '@/lib/store/blob-keys';

import { openTestDb } from '../../helpers/db';
import { completeCategorization, emptyCategorization, jpegBlob, makeTestContext } from '../../helpers/fixtures';
import { stubImageTools } from '../../helpers/stub-image-tools';

async function ingestOne(ctx: ReturnType<typeof makeTestContext>, sessionId: string, categorization = completeCategorization()) {
  return ingestPhoto(
    ctx,
    {
      sessionId,
      blob: jpegBlob(),
      origin: 'import',
      originalFilename: null,
      clientLocal: '2026-09-05T12:00:00',
      clientOffset: '-07:00',
      capture: null,
      categorization,
    },
    stubImageTools(),
  );
}

describe('updatePhotoMetadata', () => {
  it('categorization incomplete -> complete: status moves needs-metadata -> processing (stageA pending)', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestOne(ctx, session.id, emptyCategorization());
    expect(photo.status).toBe('needs-metadata');

    const updated = await updatePhotoMetadata(ctx, photo.id, { categorization: completeCategorization() });
    expect(updated.status).toBe('processing');
    db.close();
  });

  it('does not reset stageB when analyzeRequestedAt is null, even if categorization changes', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestOne(ctx, session.id, completeCategorization());

    // Force stageB to 'done' without ever requesting analysis, to distinguish "reset" from "already pending".
    const initial = await getAnalysisRecord(db, photo.id);
    const tx = db.transaction('analyses', 'readwrite');
    await tx.store.put({ ...initial!, pipeline: { ...initial!.pipeline, stageB: 'done' } });
    await tx.done;

    await updatePhotoMetadata(ctx, photo.id, { categorization: { ...completeCategorization(), roundsProne: 5 } });
    const analysis = await getAnalysisRecord(db, photo.id);
    expect(analysis?.pipeline.stageB).toBe('done');
    db.close();
  });

  it('resets stageB to pending once analysis was requested and categorization changes', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestOne(ctx, session.id, completeCategorization());
    await requestAnalysis(ctx, session.id);

    // Simulate stageB having finished before the edit.
    const analysis = await getAnalysisRecord(db, photo.id);
    const tx = db.transaction('analyses', 'readwrite');
    await tx.store.put({ ...analysis!, pipeline: { ...analysis!.pipeline, stageB: 'done' } });
    await tx.done;

    await updatePhotoMetadata(ctx, photo.id, { categorization: { ...completeCategorization(), roundsProne: 7 } });
    const after = await getAnalysisRecord(db, photo.id);
    expect(after?.pipeline.stageB).toBe('pending');
    db.close();
  });

  it('does not reset stageB when the patch does not actually change categorization or lighting', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestOne(ctx, session.id, completeCategorization());
    await requestAnalysis(ctx, session.id);

    const analysis = await getAnalysisRecord(db, photo.id);
    const tx = db.transaction('analyses', 'readwrite');
    await tx.store.put({ ...analysis!, pipeline: { ...analysis!.pipeline, stageB: 'done' } });
    await tx.done;

    await updatePhotoMetadata(ctx, photo.id, { categorization: completeCategorization(), notes: 'same rounds' });
    const after = await getAnalysisRecord(db, photo.id);
    expect(after?.pipeline.stageB).toBe('done');
    db.close();
  });

  it('emits pipeline-changed and calls notify()', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestOne(ctx, session.id, emptyCategorization());

    const notifySpy = vi.spyOn(pipelineHooks, 'notify');
    notifySpy.mockClear();
    const events: Array<{ sessionId: string; photoId?: string }> = [];
    const unsubscribe = onPipelineChanged((d) => events.push(d));

    await updatePhotoMetadata(ctx, photo.id, { notes: 'hi' });

    expect(events).toEqual([{ sessionId: session.id, photoId: photo.id }]);
    expect(notifySpy).toHaveBeenCalledTimes(1);
    unsubscribe();
    notifySpy.mockRestore();
    db.close();
  });
});

describe('deletePhoto', () => {
  it('removes the photo, its analysis, its blobs, and the id from session.photoIds', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestOne(ctx, session.id);

    await deletePhoto(ctx, photo.id);

    expect(await getPhotoRecord(db, photo.id)).toBeNull();
    expect(await getAnalysisRecord(db, photo.id)).toBeNull();
    expect(await getBlob(db, photoOriginalKey(photo.id))).toBeNull();
    const updatedSession = await getSession(ctx, session.id);
    expect(updatedSession?.photoIds).toEqual([]);
    db.close();
  });
});

describe('requestAnalysis', () => {
  it('sets analyzeRequestedAt and confirms lighting on every photo', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-09-06T00:01:00.000Z' });
    const session = await createSession(ctx);
    const photo = await ingestOne(ctx, session.id);
    expect(photo.lightingConfirmed).toBe(false);

    const updated = await requestAnalysis(ctx, session.id);
    expect(updated.analyzeRequestedAt).toBe('2026-09-06T00:01:00.000Z');

    const confirmedPhoto = await getPhotoRecord(db, photo.id);
    expect(confirmedPhoto?.lightingConfirmed).toBe(true);
    db.close();
  });

  it('resets a finished stageB to pending so results refresh (re-analysis)', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestOne(ctx, session.id);

    const analysis = await getAnalysisRecord(db, photo.id);
    const tx = db.transaction('analyses', 'readwrite');
    await tx.store.put({ ...analysis!, pipeline: { ...analysis!.pipeline, stageB: 'done' } });
    await tx.done;

    await requestAnalysis(ctx, session.id);
    const after = await getAnalysisRecord(db, photo.id);
    expect(after?.pipeline.stageB).toBe('pending');
    db.close();
  });
});
