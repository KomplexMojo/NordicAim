import { CORRECTION_FLAG_POINTS, formatPercent as pct, type CorrectionCheck } from '@/lib/leaderboard/score';
import { cn } from '@/lib/utils';

function signedPoints(delta: number): string {
  const rounded = Math.round(delta);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

/**
 * leaderboard.md §3 (issue #42): on a precision target corrected by hand, the automatic score beside the owner's, and whether the
 * board will flag the correction. Nothing for a target the app scored on its own.
 */
export function CorrectionNote({ check }: { check: CorrectionCheck }) {
  if (!check.edited) return null;
  return (
    <section
      className={cn('flex flex-col gap-1 rounded-md border p-3 text-sm', check.flagged ? 'border-amber-500/60 bg-amber-500/10' : 'border-border')}
      aria-label="Hand correction"
      data-testid="correction-note"
      data-flagged={check.flagged}
    >
      {check.auto === null ? (
        <p>
          <span className="font-medium">Edited by hand.</span> It was corrected before the app kept its automatic score, so there is
          nothing to compare with.
        </p>
      ) : (
        <p>
          <span className="font-medium">Edited by hand:</span> automatic {pct(check.auto.percent)} → yours {pct(check.final.percent)} (
          {signedPoints(check.deltaPoints ?? 0)})
        </p>
      )}
      {check.flagged && (
        <p className="text-muted-foreground" data-testid="correction-flag">
          Flagged on the board: the correction moved the score by more than {CORRECTION_FLAG_POINTS} points. It still counts.
        </p>
      )}
    </section>
  );
}
