import { afterEach, describe, expect, it } from 'vitest';

import type { Calibration } from '@/lib/domain/photo';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import {
  resetRunnerForTests,
  retryFailedStage,
  startPipelineRunner,
  waitForIdle,
} from '@/lib/pipeline/runner-browser';
import type { CvApi } from '@/lib/pipeline/stage-a';
import type { ServiceContext } from '@/lib/services/context';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { photoWorkingKey } from '@/lib/store/blob-keys';
import { putBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord, putPhotoRecord } from '@/lib/store/photos-repo';
import { putSessionRecord } from '@/lib/store/sessions-repo';
import type { ReviewAndAlignResult } from '@/workers/cv-client';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makeAnalysis, makeCapture, makePhoto, makePrior, makeSession } from '../../helpers/records';
import { stubImageTools } from '../../helpers/stub-image-tools';
import { stubRenderTools } from '../../helpers/stub-render-tools';

const MEASURED: Calibration = {
  cx: 620,
  cy: 830,
  radiusPx: 260,
  axisRatio: 0.93,
  angleDeg: 0,
  anchorDiameterMm: 112.4,
  source: 'auto',
  confidence: 0.96,
  perspective: null,
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
      return { shots: [], detection: { method: 'standard' as const, backing: 'off' as const, fallbackReason: null } };
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
});

describe('pipeline runner (analysis-pipeline §5)', () => {
  it('runs every pending Stage A job, one at a time, and then goes idle', async () => {
    const { ctx, photoIds } = await seed(2);
    const cv = stubCv();

    await startPipelineRunner(ctx, { getCvApi: () => cv.api, imageTools: stubImageTools(), renderTools: stubRenderTools() });
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

    await startPipelineRunner(ctx, { getCvApi: () => cv.api, imageTools: stubImageTools(), renderTools: stubRenderTools() });
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

    await startPipelineRunner(ctx, { getCvApi: () => cv.api, imageTools: stubImageTools(), renderTools: stubRenderTools() });
    await idle;

    expect(settled).toBe(true);
    expect(cv.calls).toBe(1);
    expect((await getAnalysisRecord(ctx.db, photoIds[0]!))?.pipeline.stageA).toBe('done');
  });

  it('picks up work added after it went idle, via pipelineHooks.notify()', async () => {
    const { ctx } = await seed(0);
    const cv = stubCv();
    await startPipelineRunner(ctx, { getCvApi: () => cv.api, imageTools: stubImageTools(), renderTools: stubRenderTools() });
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

  it('runs a Stage B job once Stage A is done and analysis has been requested (M12)', async () => {
    const { ctx, photoIds } = await seed(1, { stageA: 'done', analyzeRequested: true });
    const cv = stubCv();

    await startPipelineRunner(ctx, { getCvApi: () => cv.api, imageTools: stubImageTools(), renderTools: stubRenderTools() });
    await waitForIdle();

    const analysis = await getAnalysisRecord(ctx.db, photoIds[0]!);
    expect(analysis?.pipeline.stageB).toBe('done');
    // Stage A never measured a calibration here, so Stage B has nothing to score (§4 rule 5).
    expect(analysis?.computed).toBeNull();
    const photo = await getPhotoRecord(ctx.db, photoIds[0]!);
    expect(photo?.status).toBe('needs-attention');
    expect(photo?.reasons).toEqual(['target-not-found']);
    // Stage A was already done, so the CV worker is never asked for anything.
    expect(cv.calls).toBe(0);
  });

  it('retryFailedStage resets a failed stage and the runner runs it again (§5)', async () => {
    const { ctx, photoIds } = await seed(1, { stageA: 'done', analyzeRequested: true });
    const photoId = photoIds[0]!;
    const cv = stubCv();
    const seeded = await getAnalysisRecord(ctx.db, photoId);
    await putAnalysisRecord(ctx.db, {
      ...seeded!,
      pipeline: { ...seeded!.pipeline, stageB: 'error', error: 'render failed' },
    });

    await startPipelineRunner(ctx, { getCvApi: () => cv.api, imageTools: stubImageTools(), renderTools: stubRenderTools() });
    await waitForIdle();
    expect((await getAnalysisRecord(ctx.db, photoId))?.pipeline.stageB).toBe('error');

    await retryFailedStage(ctx, photoId);
    await waitForIdle();

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.pipeline.stageB).toBe('done');
    expect(analysis?.pipeline.error).toBeNull();
  });
});
