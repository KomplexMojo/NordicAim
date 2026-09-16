/** analysis-pipeline §5 (runner) and §7 (summary image). Both are no-ops until something registers itself. */

type Notify = () => void;
type ScheduleSummary = (sessionId: string) => void;

let runner: Notify = () => {};
let summaryScheduler: ScheduleSummary = () => {};

export const pipelineHooks = {
  notify: () => runner(),
};

export function registerRunner(fn: Notify): void {
  runner = fn;
}

/**
 * analysis-pipeline §2 (B5) / §7: Stage B asks for the session summary image to be rebuilt once it
 * finishes. M14 registers the debounced `buildComposite` scheduler; until then this is a no-op, so
 * Stage B does not have to know whether the composite exists yet.
 */
export const summaryHooks = {
  schedule: (sessionId: string) => summaryScheduler(sessionId),
};

export function registerSummaryScheduler(fn: ScheduleSummary): void {
  summaryScheduler = fn;
}
