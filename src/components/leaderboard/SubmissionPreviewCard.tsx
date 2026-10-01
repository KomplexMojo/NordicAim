import { Link } from 'react-router';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PATTERN_VIEW_LABEL } from '@/lib/patterns/collect';
import { formatPercent } from '@/lib/leaderboard/score';
import { SUBMISSION_SIZE, type SubmissionPreview } from '@/lib/leaderboard/select';

import { TargetMarks } from './TargetMarks';

interface SubmissionPreviewCardProps {
  preview: SubmissionPreview;
  /** Where a target opened from here returns to. */
  from: { path: string; label: string };
}

/**
 * leaderboard.md §4 (issue #42): what this phone would submit for one position — its best 5 precision targets of all time, their
 * average and their marks — or how many more targets it needs before it can submit at all.
 */
export function SubmissionPreviewCard({ preview, from }: SubmissionPreviewCardProps) {
  const name = PATTERN_VIEW_LABEL[`precision-${preview.position}`];
  const short = SUBMISSION_SIZE - preview.available;
  return (
    <Card data-testid="board-preview" data-complete={preview.complete}>
      <CardHeader>
        <CardTitle className="text-base">Your submission · {name}</CardTitle>
        {preview.complete ? (
          <p className="text-sm" data-testid="board-preview-summary">
            Average <span className="font-semibold tabular-nums">{formatPercent(preview.average ?? 0)}</span> · your best {SUBMISSION_SIZE} of{' '}
            {preview.available} {preview.available === 1 ? 'target' : 'targets'}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="board-preview-summary">
            {preview.available} of {SUBMISSION_SIZE} {name.toLowerCase()} targets: {short} more to submit.
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {preview.targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Analysed precision targets with a found or confirmed alignment count here. Your best {SUBMISSION_SIZE} are chosen for you.
          </p>
        ) : (
          <ol className="flex flex-col gap-1" data-testid="board-preview-targets">
            {preview.targets.map((t, i) => (
              <li key={t.photoId}>
                <Link
                  to={`/sessions/${t.sessionId}/photos/${t.photoId}`}
                  state={{ from }}
                  className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 py-1 text-sm hover:bg-muted"
                  data-testid="board-preview-target"
                >
                  <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="tabular-nums">{t.sessionDate}</span>
                  <span className="font-semibold tabular-nums">{formatPercent(t.check.final.percent)}</span>
                  <span className="text-muted-foreground tabular-nums">X {t.check.final.xCount}</span>
                  <TargetMarks check={t.check} className="ml-auto" />
                </Link>
              </li>
            ))}
          </ol>
        )}
        {preview.edited && (
          <p className="text-xs text-muted-foreground">
            Targets you corrected by hand carry an edited mark on the board; a correction of more than 10 points is flagged. They still
            count.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
