import { formatPercent } from '@/lib/leaderboard/score';
import type { BoardRow } from '@/lib/leaderboard/submission';
import { cn } from '@/lib/utils';

import { TargetMarks } from './TargetMarks';

interface BoardTableProps {
  rows: BoardRow[];
  /** This phone's own row key, highlighted. */
  ownKey: string | null;
}

/**
 * leaderboard.md §7 (issue #42): one board — every shooter's average of their best 5, best first, with their marks. A row opens to its
 * five targets, each scored on this phone, with the automatic score beside a hand-corrected one.
 */
export function BoardTable({ rows, ownKey }: BoardTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="board-empty">
        No shooters on this board yet. Import a submission or a board file someone shared with you.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-2" data-testid="board-rows">
      {rows.map((row, i) => {
        const own = row.publicKey === ownKey;
        return (
          <li key={row.publicKey} data-testid="board-row" data-own={own}>
            <details className={cn('rounded-md border px-3 py-2', own ? 'border-primary bg-primary/5' : 'border-border')}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3">
                <span className="w-6 text-right text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium" data-testid="board-row-name">
                    {row.name}
                    {own ? ' (you)' : ''}
                  </span>
                  {row.club !== '' && <span className="truncate text-xs text-muted-foreground">{row.club}</span>}
                </span>
                <TargetMarks check={row} />
                <span className="text-lg font-semibold tabular-nums" data-testid="board-row-average">
                  {formatPercent(row.average)}
                </span>
              </summary>
              <ul className="mt-2 flex flex-col gap-1 border-t pt-2 text-sm">
                {row.targets.map((t, j) => (
                  <li key={j} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="tabular-nums">{t.date}</span>
                    <span className="font-semibold tabular-nums">{formatPercent(t.check.final.percent)}</span>
                    <span className="text-muted-foreground tabular-nums">X {t.check.final.xCount}</span>
                    {t.check.edited && t.check.auto !== null && (
                      <span className="text-xs text-muted-foreground">automatic {formatPercent(t.check.auto.percent)}</span>
                    )}
                    <TargetMarks check={t.check} className="ml-auto" />
                  </li>
                ))}
              </ul>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
