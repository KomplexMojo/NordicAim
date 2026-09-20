// REV-56 (geometry-scoring.md §3, data-model §5). Re-scoring every stored session after the owner changes the
// scoring rule.
//
// Unlike the hole size or the backing, which change what detection *finds*, the rule only changes how the
// same shots are *read* — and the owner chooses it in order to see the effect. So a change re-scores
// everything already stored: each finished analysis goes back to `stageB: 'pending'`, the runner scores it
// again, and each session's summary rebuilds. **Shots and calibration are never touched**, so nothing the
// owner corrected by hand can be lost.

import { photoStatus } from '@/lib/domain/status';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { listPhotoRecords, putPhotoRecord } from '@/lib/store/photos-repo';

import type { ServiceContext } from './context';

export interface RescoreReport {
  /** Analyses sent back to Stage B. */
  photos: number;
  /** The sessions those photos belong to. */
  sessions: number;
}

export async function rescoreAll(ctx: ServiceContext): Promise<RescoreReport> {
  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['photos', 'analyses'], 'readwrite');
  const photos = await listPhotoRecords(tx);

  const touched: Array<{ sessionId: string; photoId: string }> = [];
  for (const photo of photos) {
    const analysis = await getAnalysisRecord(tx, photo.id);
    if (analysis === null) continue;
    // Only analyses that have been through both stages: anything still running or waiting will read the
    // new rule when its own Stage B runs.
    if (analysis.pipeline.stageA !== 'done' || analysis.pipeline.stageB !== 'done') continue;

    const next = { ...analysis, pipeline: { ...analysis.pipeline, stageB: 'pending' as const }, updatedAt: nowIso };
    const { status, reasons } = photoStatus({
      categorization: photo.categorization,
      analysis: next,
      result: next.computed?.result ?? null,
    });
    await putAnalysisRecord(tx, next);
    await putPhotoRecord(tx, { ...photo, status, reasons });
    touched.push({ sessionId: photo.sessionId, photoId: photo.id });
  }
  await tx.done;

  for (const t of touched) emitPipelineChanged({ sessionId: t.sessionId, photoId: t.photoId });
  if (touched.length > 0) pipelineHooks.notify();
  return { photos: touched.length, sessions: new Set(touched.map((t) => t.sessionId)).size };
}
