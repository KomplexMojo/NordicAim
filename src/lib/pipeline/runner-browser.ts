// analysis-pipeline §5. The singleton job runner: one job at a time, replanned from the database after
// every job. Browser-only (it is started from `main.tsx`), but it touches no DOM API, so tests can
// drive it directly with `fake-indexeddb`.

import { photoStatus } from '@/lib/domain/status';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import type { RenderTools } from '@/lib/render/rasterize-browser';
import type { ServiceContext } from '@/lib/services/context';
import type { ImageTools } from '@/lib/services/ingest';
import { AnalysisNotFoundError, PhotoNotFoundError } from '@/lib/services/photos';
import { getAnalysisRecord, listAnalysisRecords, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { getPhotoRecord, listPhotoRecords, putPhotoRecord } from '@/lib/store/photos-repo';
import { listSessionRecords } from '@/lib/store/sessions-repo';

import { pipelineHooks, registerRunner } from './hooks';
import { planJobs, type Job } from './plan';
import { runStageA, type CvApi } from './stage-a';
import { runStageB } from './stage-b';
import { recordTiming } from './timing';

export interface RunnerDeps {
  /** Lazy so the CV worker (and OpenCV with it) is only created when a job actually needs it. */
  getCvApi: () => CvApi;
  imageTools: ImageTools;
  renderTools: RenderTools;
}

let active: { ctx: ServiceContext; deps: RunnerDeps } | null = null;
let busy = false;
let wakeRequested = false;
let idleWaiters: Array<() => void> = [];
/** Jobs whose handler threw (not a recorded stage error): skipped for the rest of this page's life. */
const poisoned = new Set<string>();

function jobKey(job: Job): string {
  return `${job.kind}:${job.photoId}`;
}

function settleIdle(): void {
  const waiters = idleWaiters;
  idleWaiters = [];
  for (const waiter of waiters) waiter();
}

/** §5: interrupted jobs (the tab closed mid-run) are reset to `pending` on start. */
async function resetInterruptedStages(ctx: ServiceContext): Promise<void> {
  const analyses = await listAnalysisRecords(ctx.db);
  const stale = analyses.filter((a) => a.pipeline.stageA === 'running' || a.pipeline.stageB === 'running');
  if (stale.length === 0) return;

  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['photos', 'analyses'], 'readwrite');
  for (const analysis of stale) {
    const current = await getAnalysisRecord(tx, analysis.photoId);
    if (current === null) continue;
    const next = {
      ...current,
      pipeline: {
        ...current.pipeline,
        stageA: current.pipeline.stageA === 'running' ? ('pending' as const) : current.pipeline.stageA,
        stageB: current.pipeline.stageB === 'running' ? ('pending' as const) : current.pipeline.stageB,
      },
      updatedAt: nowIso,
    };
    await putAnalysisRecord(tx, next);

    const photo = await getPhotoRecord(tx, analysis.photoId);
    if (photo === null) continue;
    const { status, reasons } = photoStatus({
      categorization: photo.categorization,
      analysis: next,
      result: next.computed?.result ?? null,
    });
    await putPhotoRecord(tx, { ...photo, status, reasons });
  }
  await tx.done;
}

async function nextJob(ctx: ServiceContext): Promise<Job | null> {
  const [sessions, photos, analyses] = await Promise.all([
    listSessionRecords(ctx.db),
    listPhotoRecords(ctx.db),
    listAnalysisRecords(ctx.db),
  ]);
  for (const job of planJobs(sessions, photos, analyses)) {
    if (poisoned.has(jobKey(job))) continue;
    return job;
  }
  return null;
}

async function runJob(runner: { ctx: ServiceContext; deps: RunnerDeps }, job: Job): Promise<void> {
  const startedAt = performance.now();
  try {
    if (job.kind === 'A') {
      await runStageA(runner.ctx, job.photoId, runner.deps.getCvApi(), runner.deps.imageTools);
    } else {
      // §5 / plan.ts: a `B` job only exists once that photo's Stage A is `done`.
      await runStageB(runner.ctx, job.photoId, runner.deps.renderTools);
    }
    recordTiming({ kind: job.kind, photoId: job.photoId, ms: performance.now() - startedAt });
  } catch (err) {
    // The photo was deleted while its job ran (issue #18: deleting a session). Nothing was written — the stage
    // re-reads its record inside the write transaction and throws first — so this is not a failure to report.
    if (err instanceof PhotoNotFoundError || err instanceof AnalysisNotFoundError) return;
    // runStageA/runStageB record their own failures; reaching here means the job could not even be recorded.
    poisoned.add(jobKey(job));
    console.error(`[pipeline] ${job.kind} job failed for photo ${job.photoId}`, err);
  }
}

/** §5: plan -> take the first job -> run it -> repeat; idle when there is nothing to do. */
async function pump(): Promise<void> {
  if (busy) {
    wakeRequested = true;
    return;
  }
  // §10: "resolves when the runner has no jobs" — not "before the runner exists". `main.tsx` starts the
  // runner from an async import, so waiters that arrive first stay queued until `start` has drained.
  const runner = active;
  if (runner === null) return;

  busy = true;
  try {
    for (;;) {
      wakeRequested = false;
      const job = await nextJob(runner.ctx);
      if (job === null) {
        if (wakeRequested) continue;
        break;
      }
      await runJob(runner, job);
    }
  } finally {
    busy = false;
    settleIdle();
  }
}

/** Starts the runner (idempotent per context) and wires `pipelineHooks.notify()` to it. */
export async function startPipelineRunner(ctx: ServiceContext, deps: RunnerDeps): Promise<void> {
  active = { ctx, deps };
  registerRunner(() => {
    void pump();
  });
  await resetInterruptedStages(ctx);
  await pump();
}

/**
 * analysis-pipeline §5 ("Retry"): the failed-status button on the results screen resets whichever
 * stage failed to `pending`, recomputes the status, and wakes the runner. A photo that is not in
 * `failed` is left alone.
 */
export async function retryFailedStage(ctx: ServiceContext, photoId: string): Promise<void> {
  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['photos', 'analyses'], 'readwrite');
  const photo = await getPhotoRecord(tx, photoId);
  const analysis = await getAnalysisRecord(tx, photoId);
  if (photo === null || analysis === null) {
    await tx.done;
    throw photo === null ? new PhotoNotFoundError(photoId) : new AnalysisNotFoundError(photoId);
  }

  const { stageA, stageB } = analysis.pipeline;
  if (stageA !== 'error' && stageB !== 'error') {
    await tx.done;
    return;
  }

  const next = {
    ...analysis,
    pipeline: {
      ...analysis.pipeline,
      stageA: stageA === 'error' ? ('pending' as const) : stageA,
      stageB: stageB === 'error' ? ('pending' as const) : stageB,
      error: null,
    },
    updatedAt: nowIso,
  };
  const { status, reasons } = photoStatus({
    categorization: photo.categorization,
    analysis: next,
    result: next.computed?.result ?? null,
  });
  await putAnalysisRecord(tx, next);
  await putPhotoRecord(tx, { ...photo, status, reasons });
  await tx.done;

  emitPipelineChanged({ sessionId: photo.sessionId, photoId });
  pipelineHooks.notify();
}

/**
 * analysis-pipeline §10: resolves once the runner has started and has no jobs left to run. Calling it
 * before `startPipelineRunner` queues the waiter rather than reporting a runner-less page as idle.
 */
export function waitForIdle(): Promise<void> {
  return new Promise<void>((resolve) => {
    idleWaiters.push(resolve);
    void pump();
  });
}

/** Tests only: forgets the runner and any poisoned jobs. */
export function resetRunnerForTests(): void {
  active = null;
  busy = false;
  wakeRequested = false;
  // Release anyone still queued, so a forgotten `waitForIdle()` cannot hang the next test.
  settleIdle();
  poisoned.clear();
}
