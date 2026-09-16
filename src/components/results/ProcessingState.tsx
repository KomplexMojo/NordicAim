import { Loader2Icon } from 'lucide-react';

import type { StageState } from '@/lib/domain/enums';

interface ProcessingStateProps {
  stageA: StageState;
  stageB: StageState;
}

/**
 * analysis-pipeline §1 step 3: "While a target is processing, its card shows a spinner with the current
 * stage." `PipelineState` records whole stages (`pending | running | done | error`), not A3/A4/A5
 * sub-steps, so the wording names the stage rather than the individual CV step.
 */
function stageWording(stageA: StageState, stageB: StageState): string {
  if (stageA === 'pending') return 'Waiting to process the photo…';
  if (stageA === 'running') return 'Reviewing the photo and finding shots…';
  if (stageB === 'running') return 'Scoring the target…';
  return 'Waiting to score…';
}

export function ProcessingState({ stageA, stageB }: ProcessingStateProps) {
  return (
    <span
      className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      role="status"
      data-testid="processing-state"
    >
      <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
      {stageWording(stageA, stageB)}
    </span>
  );
}
