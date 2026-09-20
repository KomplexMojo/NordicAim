// analysis-pipeline.md §7. Browser adapter for the summary-image auto-build: debounces
// `buildComposite` per session by 1500 ms (a new trigger resets the timer), builds only when no photo
// in the session is `processing` and at least one is `analyzed`, and wires itself into `summaryHooks`
// (`pipeline/hooks.ts`) so Stage B never has to know whether the composite exists yet.

import { emitPipelineChanged } from '@/lib/pipeline/events';
import { registerSummaryScheduler } from '@/lib/pipeline/hooks';
import { waitForIdle } from '@/lib/pipeline/runner-browser';
import type { RenderTools } from '@/lib/render/rasterize-browser';
import type { ServiceContext } from '@/lib/services/context';
import { SessionNotFoundError } from '@/lib/services/sessions';
import { listPhotosBySession } from '@/lib/store/photos-repo';

import { EmptyCompositeError } from './artifact';
import { buildComposite } from './build';

const DEBOUNCE_MS = 1500;
/**
 * How long a rebuild waits for the pipeline runner before building anyway. `waitForIdle()` alone is not
 * safe here: it resolves only once a *started* runner drains, so a rebuild raised before `main.tsx` has
 * started it — or after a runner has gone — would wait for ever. Waiting is only an optimisation (don't
 * draw half a session); building a little early is always better than never building.
 */
const IDLE_WAIT_MS = 3000;

let deps: { ctx: ServiceContext; renderTools: RenderTools; release: string } | null = null;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Sessions with a build scheduled or currently running — the Summary card's "Updating summary…" state. */
const pending = new Set<string>();

async function runBuild(sessionId: string): Promise<void> {
  timers.delete(sessionId);
  if (deps === null) {
    pending.delete(sessionId);
    return;
  }
  const { ctx, renderTools, release } = deps;

  try {
    // Don't build while the pipeline is mid-run, or the image would show half a session. Waiting for the
    // runner (rather than skipping on a stored `processing` status) matters: a photo left at `processing`
    // — a job the runner is not working on — used to block this session's summary for ever, silently.
    // The owner hit exactly that: "No matter what I do, I can't get the session summary … to show".
    if ((await listPhotosBySession(ctx.db, sessionId)).some((p) => p.status === 'processing')) {
      await Promise.race([waitForIdle(), new Promise((resolve) => setTimeout(resolve, IDLE_WAIT_MS))]);
    }
    const photos = await listPhotosBySession(ctx.db, sessionId);
    if (!photos.some((p) => p.status === 'analyzed')) return;

    await buildComposite(ctx, sessionId, renderTools, release);
  } catch (err) {
    // A momentarily-empty session (every candidate rejected) is not an error worth logging, and neither is one that
    // was deleted while its rebuild waited (issue #18): nothing was written, `buildComposite` re-reads the session
    // inside its write transaction and throws first.
    if (!(err instanceof EmptyCompositeError) && !(err instanceof SessionNotFoundError)) {
      console.error('[summary] build failed', err);
    }
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
export function startSummaryScheduler(ctx: ServiceContext, renderTools: RenderTools, release = 'dev'): void {
  deps = { ctx, renderTools, release };
  registerSummaryScheduler(schedule);
}

/**
 * Rebuilds this session's summary image now-ish (the same debounced path Stage B uses). The Summary card
 * calls it for its "Update summary" button and when the stored artifact was drawn by an older renderer.
 */
export function scheduleSummaryRebuild(sessionId: string): void {
  schedule(sessionId);
}

/** Whether a build is scheduled (debounce pending) or running for this session. */
export function isSummaryPending(sessionId: string): boolean {
  return pending.has(sessionId);
}
