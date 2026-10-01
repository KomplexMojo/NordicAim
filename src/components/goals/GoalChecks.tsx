import { Check, X } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { GoalView } from '@/lib/domain/goals';
import { goalCheckLabel, type SessionGoalChecks, type ViewGoalChecks } from '@/lib/goals/session';
import { PATTERN_VIEW_LABEL } from '@/lib/patterns/collect';
import { cn } from '@/lib/utils';

/**
 * goals.md §8 (REV-148): one view's goals as they stood when the session was created, this session's own value against each,
 * and met (✓) or not (✗). "All goals met" when every one was, as the summary image's seal says.
 */
export function GoalChecks({ view, checks }: { view: GoalView; checks: ViewGoalChecks }) {
  const met = checks.checks.filter((c) => c.met === true).length;
  return (
    <section className="flex flex-col gap-1" data-testid={`goal-checks-${view}`} data-all-met={checks.allMet}>
      <h3 className="flex items-baseline justify-between gap-2 text-sm font-medium">
        <span>{PATTERN_VIEW_LABEL[view]}</span>
        <span
          className={cn('text-sm font-semibold', checks.allMet ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}
          data-testid={`goal-checks-${view}-summary`}
        >
          {checks.allMet ? 'All goals met' : `${met} of ${checks.checks.length} met`}
        </span>
      </h3>
      <ul className="flex flex-col text-sm">
        {checks.checks.map((check) => {
          const label = goalCheckLabel(view, check);
          return (
            <li
              key={check.metric}
              className="flex min-h-8 items-center justify-between gap-2 tabular-nums"
              data-testid={`goal-check-${view}-${check.metric}`}
              data-met={String(check.met)}
            >
              <span>{label.title}</span>
              <span className="flex items-center gap-2">
                <span>
                  {label.value} <span className="text-muted-foreground">/ goal {label.goal}</span>
                </span>
                {check.met === true ? (
                  <Check className="size-5 text-emerald-700 dark:text-emerald-400" aria-label="Met" />
                ) : check.met === false ? (
                  <X className="size-5 text-red-700 dark:text-red-400" aria-label="Not met" />
                ) : (
                  <span className="w-5 text-center text-muted-foreground" aria-label="No value">
                    —
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** REV-148: the "Goals" card on the results screen (every view the session has checks for) and a target's screen (its own view). */
export function GoalChecksCard({
  goals,
  views = GoalView.options,
  note,
  testId,
}: {
  goals: SessionGoalChecks | undefined;
  views?: readonly GoalView[];
  note: string;
  testId: string;
}) {
  const shown = views.flatMap((view) => {
    const checks = goals?.[view];
    return checks === undefined ? [] : [{ view, checks }];
  });
  if (shown.length === 0) return null;
  return (
    <Card data-testid={testId}>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Goals</h2>
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
        {shown.map(({ view, checks }) => (
          <GoalChecks key={view} view={view} checks={checks} />
        ))}
      </CardContent>
    </Card>
  );
}
