/** analysis-pipeline §5. A no-op until the runner registers itself (M10). */

type Notify = () => void;

let runner: Notify = () => {};

export const pipelineHooks = {
  notify: () => runner(),
};

export function registerRunner(fn: Notify): void {
  runner = fn;
}
