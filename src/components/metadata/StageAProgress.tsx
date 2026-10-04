import { Badge } from '@/components/ui/badge';
import type { StageState } from '@/lib/domain/enums';
import { stageALabel } from '@/lib/ui/panel-labels';

interface StageAProgressProps {
  stageA: StageState;
  error: string | null;
}

/**
 * analysis-pipeline §1 (issue #81): what the phone is doing with the photo, in the athlete's words. Stage A's stored state
 * is only `pending | running | done | error` (no sub-steps), so a queued photo reads "Queued…" and a running one says what
 * Stage A does as a whole — "Aligning and finding shots…" — rather than both reading "Waiting…".
 */
export function StageAProgress({ stageA, error }: StageAProgressProps) {
  if (stageA === 'error') {
    return (
      <Badge variant="destructive" data-testid="stage-a-progress" data-state="error">
        {stageALabel('error', error)}
      </Badge>
    );
  }
  if (stageA === 'done') {
    return (
      <Badge variant="secondary" data-testid="stage-a-progress" data-state="done">
        {stageALabel('done', null)}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" data-testid="stage-a-progress" data-state={stageA}>
      {stageALabel(stageA, null)}
    </Badge>
  );
}
