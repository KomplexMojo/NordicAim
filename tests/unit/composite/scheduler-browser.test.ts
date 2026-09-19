import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { isSummaryPending, startSummaryScheduler } from '@/lib/composite/scheduler-browser';
import { COMPOSITE_RENDERER_VERSION } from '@/lib/render/composite';
import { initialAnalysis, type Shot } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { registerSummaryScheduler, summaryHooks } from '@/lib/pipeline/hooks';
import { analyzeTarget } from '@/lib/scoring/analyze';
import type { ServiceContext } from '@/lib/services/context';
import { putAnalysisRecord } from '@/lib/store/analyses-repo';
import { getBlob } from '@/lib/store/blobs-repo';
import { putPhotoRecord } from '@/lib/store/photos-repo';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makePhoto, makeSession } from '../../helpers/records';
import { stubRenderTools } from '../../helpers/stub-render-tools';

interface ShotsFixture {
  template: 'sighting' | 'precision';
  categorization: Categorization;
  shots: Shot[];
}

function readFixture(name: string): ShotsFixture {
  const path = fileURLToPath(new URL(`../../../fixtures/reference/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf-8')) as ShotsFixture;
}

const precisionFixture = readFixture('sample-shots-precision.json');

async function seed(status: 'processing' | 'analyzed'): Promise<{ ctx: ServiceContext; sessionId: string }> {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  const session = makeSession();
  const photo = makePhoto({ sessionId: session.id, status, categorization: precisionFixture.categorization });
  await putSessionRecord(db, { ...session, photoIds: [photo.id] });
  await putPhotoRecord(db, photo);

  const analysis = initialAnalysis(photo.id, '2026-09-05T23:40:00.000Z');
  if (status === 'analyzed') {
    const result = analyzeTarget({
      template: precisionFixture.template,
      categorization: precisionFixture.categorization,
      shots: precisionFixture.shots,
    });
    await putAnalysisRecord(db, { ...analysis, shots: precisionFixture.shots, computed: { engineVersion: '1', result } });
  } else {
    await putAnalysisRecord(db, analysis);
  }
  return { ctx, sessionId: session.id };
}

// Real timers throughout: fake-indexeddb schedules its own callbacks with `setTimeout`, so faking
// timers here would also freeze the database and every `await` on it would hang.
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('composite/scheduler-browser (analysis-pipeline.md §7)', () => {
  afterEach(() => {
    // Restore the process-wide hook so later test files don't inherit this file's scheduler.
    registerSummaryScheduler(() => {});
  });

  it('schedule() marks the session pending and buildComposite runs after the 1500ms debounce', async () => {
    const { ctx, sessionId } = await seed('analyzed');
    startSummaryScheduler(ctx, stubRenderTools());

    summaryHooks.schedule(sessionId);
    expect(isSummaryPending(sessionId)).toBe(true);

    await vi.waitFor(() => expect(isSummaryPending(sessionId)).toBe(false), { timeout: 4000, interval: 50 });
  }, 10_000);

  it('a second schedule() call before the debounce elapses resets the timer', async () => {
    const { ctx, sessionId } = await seed('analyzed');
    startSummaryScheduler(ctx, stubRenderTools());

    summaryHooks.schedule(sessionId);
    await wait(1000);
    summaryHooks.schedule(sessionId); // resets the 1500ms window
    await wait(1000);
    // Still pending: only 1000ms have elapsed since the reset.
    expect(isSummaryPending(sessionId)).toBe(true);

    await vi.waitFor(() => expect(isSummaryPending(sessionId)).toBe(false), { timeout: 4000, interval: 50 });
  }, 10_000);

  it('does not build a session with nothing analyzed, even after waiting for the runner', async () => {
    const { ctx, sessionId } = await seed('processing');
    startSummaryScheduler(ctx, stubRenderTools());

    summaryHooks.schedule(sessionId);
    await vi.waitFor(() => expect(isSummaryPending(sessionId)).toBe(false), { timeout: 10_000, interval: 50 });

    const session = await getSessionRecord(ctx.db, sessionId);
    expect(session?.artifacts).toHaveLength(0);
  }, 15_000);

  it('builds anyway when a photo is stuck at processing but another is analyzed (owner report 2026-09-19)', async () => {
    // A photo left at `processing` — a job the runner is not working on — used to block this session's
    // summary for ever: "No matter what I do, I can't get the session summary … to show".
    const { ctx, sessionId } = await seed('analyzed');
    const stuck = makePhoto({ sessionId, status: 'processing', categorization: precisionFixture.categorization });
    await putPhotoRecord(ctx.db, stuck);
    await putAnalysisRecord(ctx.db, initialAnalysis(stuck.id, '2026-09-05T23:40:00.000Z'));
    const session = await getSessionRecord(ctx.db, sessionId);
    await putSessionRecord(ctx.db, { ...session!, photoIds: [...session!.photoIds, stuck.id] });

    startSummaryScheduler(ctx, stubRenderTools());
    summaryHooks.schedule(sessionId);
    await vi.waitFor(() => expect(isSummaryPending(sessionId)).toBe(false), { timeout: 8000, interval: 50 });

    expect((await getSessionRecord(ctx.db, sessionId))?.artifacts).toHaveLength(1);
  }, 15_000);

  it('stamps the renderer version, so a later app can tell the artifact is stale', async () => {
    const { ctx, sessionId } = await seed('analyzed');
    startSummaryScheduler(ctx, stubRenderTools());
    summaryHooks.schedule(sessionId);
    await vi.waitFor(() => expect(isSummaryPending(sessionId)).toBe(false), { timeout: 4000, interval: 50 });

    const session = await getSessionRecord(ctx.db, sessionId);
    expect(session?.artifacts[0]?.rendererVersion).toBe(COMPOSITE_RENDERER_VERSION);
  }, 10_000);

  it('builds and stores an artifact once no photo is processing and one is analyzed', async () => {
    const { ctx, sessionId } = await seed('analyzed');
    startSummaryScheduler(ctx, stubRenderTools());

    summaryHooks.schedule(sessionId);
    await vi.waitFor(() => expect(isSummaryPending(sessionId)).toBe(false), { timeout: 4000, interval: 50 });

    const session = await getSessionRecord(ctx.db, sessionId);
    expect(session?.artifacts).toHaveLength(1);
    const png = await getBlob(ctx.db, `artifact:${session!.artifacts[0]!.id}:png`);
    expect(png).not.toBeNull();
  }, 10_000);
});
