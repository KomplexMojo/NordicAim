import { afterEach, describe, expect, it } from 'vitest';

import type { Calibration } from '@/lib/domain/photo';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import {
  registerStageBHandler,
  resetRunnerForTests,
  startPipelineRunner,
  waitForIdle,
} from '@/lib/pipeline/runner-browser';
import type { CvApi } from '@/lib/pipeline/stage-a';
import type { ServiceContext } from '@/lib/services/context';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { photoWorkingKey } from '@/lib/store/blob-keys';
import { putBlob } from '@/lib/store/blobs-repo';
import { putPhotoRecord } from '@/lib/store/photos-repo';
import { putSessionRecord } from '@/lib/store/sessions-repo';
import type { ReviewAndAlignResult } from '@/workers/cv-client';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makeAnalysis, makeCapture, makePhoto, makePrior, makeSession } from '../../helpers/records';
import { stubImageTools } from '../../helpers/stub-image-tools';

const MEASURED: Calibration = {
  cx: 620,
  cy: 830,
  radiusPx: 260,
  axisRatio: 0.93,
  angleDeg: 0,
  anchorDiameterMm: 112.4,
  source: 'auto',
  confidence: 0.96,
};

function stubCv(): { api: CvApi; calls: number } {
  const state = { calls: 0 };
  const result: ReviewAndAlignResult = {
    detection: { calibration: MEASURED, confidence: 0.96, outsidePrior: false },
    sharpness: 120,
    templateHint: { template: 'precision', confidence: 0.75 },
  };
  const api: CvApi = {
    async reviewAndAlign() {
      state.calls += 1;
      return result;
    },
    async detectShots() {
      return { shots: [] };
    },
  };
  return {
    api,
    get calls() {
      return state.calls;
    },
  };
}

interface Seeded {
  ctx: ServiceContext;
  sessionId: string;
  photoIds: string[];
}

async function seed(
  count: number,
  opts: { stageA?: 'pending' | 'running' | 'done'; stageB?: 'pending' | 'done'; analyzeRequested?: boolean } = {},
): Promise<Seeded> {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  const session = makeSession({ analyzeRequestedAt: opts.analyzeRequested === true ? '2026-09-06T00:01:00.000Z' : null });
  const photoIds: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const photo = makePhoto({
      sessionId: session.id,
      importedAt: `2026-09-05T23:4${i}:00.000Z`,
      capture: makeCapture({ calibrationPriorFramePx: makePrior() }),
    });
    photoIds.push(photo.id);
    await putPhotoRecord(db, photo);
    await putAnalysisRecord(
      db,
      makeAnalysis(photo.id, { stageA: opts.stageA ?? 'pending', stageB: opts.stageB ?? 'pending' }),
    );
    await putBlob(db, photoWorkingKey(photo.id), {
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
      contentType: 'image/jpeg',
      sizeBytes: 4,
      createdAt: '2026-09-05T23:40:00.000Z',
    });
  }
  await putSessionRecord(db, { ...session, photoIds });

  return { ctx, sessionId: session.id, photoIds };
}

afterEach(() => {
  resetRunnerForTests();
  registerStageBHandler(null);
});

describe('pipeline runner (analysis-pipeline §5)', () => {
  it('runs every pending Stage A job, one at a time, and then goes idle', async () => {
    const { ctx, photoIds } = await seed(2);
    const cv = stubCv();

    await startPipelineRunner(ctx, { getCvApi: () => cv.api, imageTools: stubImageTools() });
    await waitForIdle();

    expect(cv.calls).toBe(2);
    for (const photoId of photoIds) {
      const analysis = await getAnalysisRecord(ctx.db, photoId);
      expect(analysis?.pipeline.stageA).toBe('done');
      expect(analysis?.pipeline.alignment.method).toBe('cv');
    }
  });

  it('resets a job left running by an interrupted visit and reruns it', async () => {
    const { ctx, photoIds } = await seed(1, { stageA: 'running' });
    const cv = stubCv();

    await startPipelineRunner(ctx, { getCvApi: () => cv.api, imageTools: stubImageTools() });
    await waitForIdle();

    expect(cv.calls).toBe(1);
    expect((await getAnalysisRecord(ctx.db, photoIds[0]!))?.pipeline.stageA).toBe('done');
  });

  it('does not report idle before the runner has started (§10)', async () => {
    const { ctx, photoIds } = await seed(1);
    const cv = stubCv();

    let settled = false;
    const idle = waitForIdle().then(() => {
      settled = true;
    });

    // The page has work queued but no runner yet (main.tsx starts it from an async import).
    expect((await getAnalysisRecord(ctx.db, photoIds[0]!))?.pipeline.stageA).toBe('pending');
    expect(settled).toBe(false);

    await startPipelineRunner(ctx, { getCvApi: () => cv.api, imageTools: stubImageTools() });
    await idle;

    expect(settled).toBe(true);
    expect(cv.calls).toBe(1);
    expect((await getAnalysisRecord(ctx.db, photoIds[0]!))?.pipeline.stageA).toBe('done');
  });

  it('picks up work added after it went idle, via pipelineHooks.notify()', async () => {
    const { ctx } = await seed(0);
    const cv = stubCv();
    await startPipelineRunner(ctx, { getCvApi: () => cv.api, imageTools: stubImageTools() });
    await waitForIdle();
    expect(cv.calls).toBe(0);

    const photo = makePhoto({ capture: makeCapture({ calibrationPriorFramePx: makePrior() }) });
    await putSessionRecord(ctx.db, makeSession({ id: photo.sessionId, photoIds: [photo.id] }));
    await putPhotoRecord(ctx.db, photo);
    await putAnalysisRecord(ctx.db, makeAnalysis(photo.id));
    await putBlob(ctx.db, photoWorkingKey(photo.id), {
      bytes: new Uint8Array([0xff, 0xd8]).buffer,
      contentType: 'image/jpeg',
      sizeBytes: 2,
      createdAt: '2026-09-05T23:40:00.000Z',
    });

    pipelineHooks.notify();
    await waitForIdle();

    expect(cv.calls).toBe(1);
    expect((await getAnalysisRecord(ctx.db, photo.id))?.pipeline.stageA).toBe('done');
  });

  it('skips Stage B jobs until a handler is registered (M12)', async () => {
    const { ctx, photoIds } = await seed(1, { stageA: 'done', analyzeRequested: true });
    const cv = stubCv();

    await startPipelineRunner(ctx, { getCvApi: () => cv.api, imageTools: stubImageTools() });
    await waitForIdle();
    expect((await getAnalysisRecord(ctx.db, photoIds[0]!))?.pipeline.stageB).toBe('pending');

    const handled: string[] = [];
    registerStageBHandler(async (handlerCtx, photoId) => {
      handled.push(photoId);
      const analysis = await getAnalysisRecord(handlerCtx.db, photoId);
      if (analysis !== null) {
        await putAnalysisRecord(handlerCtx.db, {
          ...analysis,
          pipeline: { ...analysis.pipeline, stageB: 'done' },
        });
      }
    });

    pipelineHooks.notify();
    await waitForIdle();

    expect(handled).toEqual([photoIds[0]]);
    expect((await getAnalysisRecord(ctx.db, photoIds[0]!))?.pipeline.stageB).toBe('done');
  });
});
