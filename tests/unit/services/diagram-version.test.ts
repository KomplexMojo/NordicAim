import { describe, expect, it } from 'vitest';

import { defaultAppSettings } from '@/lib/domain/settings';
import { DIAGRAM_RENDERER_VERSION } from '@/lib/render/version';
import { refreshStaleDiagrams } from '@/lib/services/diagram-version';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { putPhotoRecord } from '@/lib/store/photos-repo';
import { putSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings, putSettings } from '@/lib/store/settings-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makeAnalysis, makePhoto, makeSession } from '../../helpers/records';

// REV-58: stored per-target diagrams are written when a photo is scored, so a renderer change reaches an existing
// session only if something sends it back through Stage B. That is this, once, at app start.

async function seed(diagramRendererVersion: number) {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  await putSettings(db, { ...defaultAppSettings(), diagramRendererVersion });
  const session = makeSession();
  const photo = makePhoto({ sessionId: session.id, status: 'analyzed' });
  await putSessionRecord(db, { ...session, photoIds: [photo.id] });
  await putPhotoRecord(db, photo);
  await putAnalysisRecord(db, makeAnalysis(photo.id, { stageA: 'done', stageB: 'done' }));
  return { db, ctx, photo };
}

describe('refreshStaleDiagrams (REV-58)', () => {
  it('scores every finished analysis again when the stored version is behind, and records the new version', async () => {
    const { db, ctx, photo } = await seed(0);
    const report = await refreshStaleDiagrams(ctx);
    expect(report).toEqual({ photos: 1, sessions: 1 });
    expect((await getAnalysisRecord(db, photo.id))?.pipeline.stageB).toBe('pending');
    expect((await getSettings(db)).diagramRendererVersion).toBe(DIAGRAM_RENDERER_VERSION);
    db.close();
  });

  it('does nothing when the diagrams are already current', async () => {
    const { db, ctx, photo } = await seed(DIAGRAM_RENDERER_VERSION);
    expect(await refreshStaleDiagrams(ctx)).toBeNull();
    expect((await getAnalysisRecord(db, photo.id))?.pipeline.stageB).toBe('done');
    db.close();
  });

  it('runs once: a second launch finds the version recorded and touches nothing', async () => {
    const { db, ctx, photo } = await seed(0);
    await refreshStaleDiagrams(ctx);
    // Stage B has since finished and redrawn the diagram.
    await putAnalysisRecord(db, { ...(await getAnalysisRecord(db, photo.id))!, pipeline: { ...(await getAnalysisRecord(db, photo.id))!.pipeline, stageB: 'done' } });
    expect(await refreshStaleDiagrams(ctx)).toBeNull();
    expect((await getAnalysisRecord(db, photo.id))?.pipeline.stageB).toBe('done');
    db.close();
  });

  it('never touches shots or alignment', async () => {
    const { db, ctx, photo } = await seed(0);
    const before = await getAnalysisRecord(db, photo.id);
    await refreshStaleDiagrams(ctx);
    const after = await getAnalysisRecord(db, photo.id);
    expect(after?.shots).toEqual(before?.shots);
    expect(after?.calibration).toEqual(before?.calibration);
    db.close();
  });

  it('a settings row from before the version existed reads as behind and is refreshed', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const { diagramRendererVersion, ...old } = defaultAppSettings();
    void diagramRendererVersion;
    await db.put('settings', old as never);
    expect(await refreshStaleDiagrams(ctx)).toEqual({ photos: 0, sessions: 0 });
    expect((await getSettings(db)).diagramRendererVersion).toBe(DIAGRAM_RENDERER_VERSION);
    db.close();
  });
});
