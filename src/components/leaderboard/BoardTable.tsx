import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { Challenge } from '@/lib/leaderboard/challenge';
import { formatPercent } from '@/lib/leaderboard/score';
import type { BoardRow } from '@/lib/leaderboard/submission';
import { cn } from '@/lib/utils';

import { ChallengeForm } from './ChallengeForm';
import { TargetMarks } from './TargetMarks';

export interface ShownRow {
  row: BoardRow;
  challenges: Challenge[];
}

interface BoardTableProps {
  rows: ShownRow[];
  /** This phone's own row key, highlighted; it cannot be challenged from here. */
  ownKey: string;
  /** Called after a challenge was saved, so the board re-reads. */
  onChallenged(): void;
}

/**
 * leaderboard.md §7, §9 (issue #42): one board — every shooter's average of their best 5, best first, with their marks. A row opens to
 * its five targets, each scored on this phone (the automatic score beside a hand-corrected one), any challenges against it, and a
 * Challenge button on each target of someone else's entry.
 */
export function BoardTable({ rows, ownKey, onChallenged }: BoardTableProps) {
  const [challenging, setChallenging] = useState<{ key: string; index: number } | null>(null);
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="board-empty">
        No shooters on this board yet. Import a submission or a board file someone shared with you.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-2" data-testid="board-rows">
      {rows.map(({ row, challenges }, i) => {
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
                {challenges.length > 0 && (
                  <span className="rounded border border-destructive/50 px-1.5 py-0.5 text-xs" data-testid="mark-challenged">
                    Challenged
                  </span>
                )}
                <TargetMarks check={row} />
                <span className="text-lg font-semibold tabular-nums" data-testid="board-row-average">
                  {formatPercent(row.average)}
                </span>
              </summary>
              <ul className="mt-2 flex flex-col gap-2 border-t pt-2 text-sm">
                {row.targets.map((t, j) => {
                  const against = challenges.filter((c) => c.index === j);
                  const open = challenging?.key === row.publicKey && challenging.index === j;
                  return (
                    <li key={j} className="flex flex-col gap-1" data-testid="board-row-target">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="tabular-nums">{t.date}</span>
                        <span className="font-semibold tabular-nums">{formatPercent(t.check.final.percent)}</span>
                        <span className="text-muted-foreground tabular-nums">X {t.check.final.xCount}</span>
                        {t.check.edited && t.check.auto !== null && (
                          <span className="text-xs text-muted-foreground">automatic {formatPercent(t.check.auto.percent)}</span>
                        )}
                        <TargetMarks check={t.check} className="ml-auto" />
                        {!own && !open && (
                          <Button variant="ghost" className="h-11 px-2 text-xs" onClick={() => setChallenging({ key: row.publicKey, index: j })} data-testid="challenge-open">
                            Challenge
                          </Button>
                        )}
                      </div>
                      {against.map((c) => (
                        <p key={c.challenger} className="text-xs text-muted-foreground" data-testid="challenge-reason-shown">
                          Challenged by {c.challengerName}: “{c.reason}”
                        </p>
                      ))}
                      {open && (
                        <ChallengeForm
                          target={{ shooter: row.publicKey, submissionSignedAt: row.signedAt, position: row.position, index: j }}
                          onSaved={onChallenged}
                          onDone={() => setChallenging(null)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
