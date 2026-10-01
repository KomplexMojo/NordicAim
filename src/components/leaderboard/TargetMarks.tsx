import type { CorrectionCheck } from '@/lib/leaderboard/score';
import { cn } from '@/lib/utils';

/** leaderboard.md §3: the small "Edited" and "Flagged" marks a target carries on the board. Nothing for an untouched target. */
export function TargetMarks({ check, className }: { check: Pick<CorrectionCheck, 'edited' | 'flagged'>; className?: string }) {
  if (!check.edited) return null;
  return (
    <span className={cn('flex gap-1 text-xs', className)}>
      <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground" data-testid="mark-edited">
        Edited
      </span>
      {check.flagged && (
        <span className="rounded border border-amber-500/60 bg-amber-500/10 px-1.5 py-0.5" data-testid="mark-flagged">
          Flagged
        </span>
      )}
    </span>
  );
}
