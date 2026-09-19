// analysis-pipeline.md §7. Browser adapter for the summary-image auto-build: debounces
// `buildComposite` per session by 1500 ms (a new trigger resets the timer), builds only when no photo
// in the session is `processing` and at least one is `analyzed`, and wires itself into `summaryHooks`
// (`pipeline/hooks.ts`) so Stage B never has to know whether the composite exists yet.

import { emitPipelineChanged } from '@/lib/pipeline/events';
import { registerSummaryScheduler } from '@/lib/pipeline/hooks';
import type { RenderTools } from '@/lib/render/rasterize-browser';
import type { ServiceContext } from '@/lib/services/context';
import { listPhotosBySession } from '@/lib/store/photos-repo';

import { EmptyCompositeError } from './artifact';
import { buildComposite } from './build';

const DEBOUNCE_MS = 1500;

let deps: { ctx: ServiceContext; renderTools: RenderTools } | null = null;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Sessions with a build scheduled or currently running — the Summary card's "Updating summary…" state. */
const pending = new Set<string>();

async function runBuild(sessionId: string): Promise<void> {
  timers.delete(sessionId);
  if (deps === null) {
    pending.delete(sessionId);
    return;
  }
  const { ctx, renderTools } = deps;

  try {
    const photos = await listPhotosBySession(ctx.db, sessionId);
    const anyProcessing = photos.some((p) => p.status === 'processing');
    const anyAnalyzed = photos.some((p) => p.status === 'analyzed');
    if (anyProcessing || !anyAnalyzed) return;

    await buildComposite(ctx, sessionId, renderTools);
  } catch (err) {
    // A momentarily-empty session (every candidate rejected) is not an error worth logging.
    if (!(err instanceof EmptyCompositeError)) console.error('[summary] build failed', err);
  } finally {
    pending.delete(sessionId);
    emitPipelineChanged({ sessionId });
  }
}

function schedule(sessionId: string): void {
  const existing = timers.get(sessionId);
  if (existing !== undefined) clearTimeout(existing);
  pending.add(sessionId);
  timers.set(
    sessionId,
    setTimeout(() => void runBuild(sessionId), DEBOUNCE_MS),
  );
  emitPipelineChanged({ sessionId });
}

/** Starts the scheduler (idempotent) and wires `summaryHooks.schedule()` to it. Call once from `main.tsx`. */
export function startSummaryScheduler(ctx: ServiceContext, renderTools: RenderTools): void {
  deps = { ctx, renderTools };
  registerSummaryScheduler(schedule);
}

/** Whether a build is scheduled (debounce pending) or running for this session. */
export function isSummaryPending(sessionId: string): boolean {
  return pending.has(sessionId);
}
