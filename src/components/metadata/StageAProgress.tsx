import { Badge } from '@/components/ui/badge';
import type { StageState } from '@/lib/domain/enums';

interface StageAProgressProps {
  stageA: StageState;
  error: string | null;
}

/** analysis-pipeline §1: "Checking photo…" / "Aligning…" / "Finding shots…" / "Ready" once M10/M11 give Stage A
 * sub-step data; `PipelineState` only carries `pending | running | done | error` today, so pending/running both
 * read "Waiting…" until then. */
export function StageAProgress({ stageA, error }: StageAProgressProps) {
  if (stageA === 'error') {
    return (
      <Badge variant="destructive" data-testid="stage-a-progress">
        Couldn't process this photo{error ? `: ${error}` : ''}
      </Badge>
    );
  }
  if (stageA === 'done') {
    return (
      <Badge variant="secondary" data-testid="stage-a-progress">
        Ready
      </Badge>
    );
  }
  return (
    <Badge variant="outline" data-testid="stage-a-progress">
      Waiting…
    </Badge>
  );
}
