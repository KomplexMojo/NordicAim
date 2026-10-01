import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { GoalChart } from '@/components/goals/GoalChart';
import { ViewSwitch } from '@/components/patterns/ViewRangeControls';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { GoalView } from '@/lib/domain/goals';
import { goalMetrics, goalTrend } from '@/lib/goals/metrics';
import { PATTERN_VIEW_LABEL } from '@/lib/patterns/collect';
import { loadPatterns } from '@/lib/services/patterns';
import { listGoals, setGoal } from '@/lib/services/goals';

const GOAL_VIEWS: readonly GoalView[] = GoalView.options;
/** Sight in and Confirm aren't goal-able (owner, 2026-09-30); a URL naming anything else falls back to this. */
const GOAL_DEFAULT_VIEW: GoalView = 'precision-prone';

/**
 * Route `#/goals` (goals.md, issue #97): the current goal per (view, metric) on the two precision views, drawn as one
 * line on a chart of every session, with whether the sessions since it was set average out at or past it. No date
 * range and no goal history (owner, 2026-10-01): a goal is measured from when it was set, and changing it starts
 * over. The charts are `goalMetrics` (`lib/goals/metrics.ts`): Score, Group size and Accuracy from Analysis, plus
 * Biathlon hits.
 */
export function GoalsPage() {
  const { ctx } = useServices();
  const { value, loading } = useLiveQuery(() => loadPatterns(ctx), [ctx]);
  const [refreshKey, setRefreshKey] = useState(0);
  const { value: entries } = useLiveQuery(() => listGoals(ctx), [ctx, refreshKey]);

  // Issue #72's pattern: the view lives in the address, so Back returns to it.
  const [params, setParams] = useSearchParams();
  const requested = params.get('view');
  const view = GoalView.safeParse(requested).data ?? GOAL_DEFAULT_VIEW;
  const setView = (v: GoalView) => setParams(new URLSearchParams({ view: v }), { replace: true });

  const trend = useMemo(() => (value === undefined ? [] : goalTrend(value.data.points[view], view, value.holeDiameterMm)), [value, view]);
  const metrics = useMemo(() => goalMetrics(view), [view]);

  async function handleSetGoal(metricId: (typeof metrics)[number]['id'], newValue: number) {
    await setGoal(ctx, { view, metric: metricId, value: newValue });
    setRefreshKey((k) => k + 1);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 lg:max-w-6xl">
      <h1 className="text-xl font-semibold">Goals</h1>

      <ViewSwitch view={view} onView={setView} testIdPrefix="goals" views={GOAL_VIEWS} />

      {loading && value === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <p className="text-sm font-medium" data-testid="goals-counts">
            {PATTERN_VIEW_LABEL[view]}: {trend.length} {trend.length === 1 ? 'session' : 'sessions'}
          </p>
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions here yet.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {metrics.map((m) => (
                <GoalChart
                  key={`${view}-${m.id}`}
                  view={view}
                  metric={m}
                  trend={trend}
                  entries={entries ?? []}
                  onSetGoal={(v) => handleSetGoal(m.id, v)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
