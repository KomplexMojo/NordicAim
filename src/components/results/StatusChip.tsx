import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PhotoStatus, StageState } from '@/lib/domain/enums';

import { ProcessingState } from './ProcessingState';

interface StatusChipProps {
  status: PhotoStatus;
  stageA: StageState;
  stageB: StageState;
  /** Shown only for `failed` (analysis-pipeline §5 "Retry"). */
  onRetry?: () => void;
}

/**
 * analysis-pipeline §1 step 3 / §4: the photo's status as a chip — `analyzed` green, `needs-attention`
 * amber, `failed` red with a Retry button, and a spinner with the current stage while it is working.
 */
export function StatusChip({ status, stageA, stageB, onRetry }: StatusChipProps) {
  if (status === 'processing' || status === 'ready') {
    return (
      <div data-testid="status-chip" data-status={status}>
        <ProcessingState stageA={stageA} stageB={stageB} />
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="status-chip" data-status={status}>
        <Badge variant="destructive">Failed</Badge>
        {onRetry && (
          <Button variant="outline" className="h-11" data-testid="retry-button" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (status === 'needs-attention') {
    return (
      <div data-testid="status-chip" data-status={status}>
        <Badge className="bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-50">Needs attention</Badge>
      </div>
    );
  }

  if (status === 'analyzed') {
    return (
      <div data-testid="status-chip" data-status={status}>
        <Badge className="bg-emerald-200 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-50">Analyzed</Badge>
      </div>
    );
  }

  return (
    <div data-testid="status-chip" data-status={status}>
      <Badge variant="outline">Needs metadata</Badge>
    </div>
  );
}
