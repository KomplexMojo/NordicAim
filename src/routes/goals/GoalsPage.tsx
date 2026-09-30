import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { GoalChart } from '@/components/goals/GoalChart';
import { ViewRangeControls } from '@/components/patterns/ViewRangeControls';
import { sessionTrend, trendMetrics } from '@/lib/analysis/trend';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { PATTERN_VIEW_LABEL, filterByRange, type PatternRange, type PatternView } from '@/lib/patterns/collect';
import { loadPatterns } from '@/lib/services/patterns';
import { listGoals, setGoal } from '@/lib/services/goals';
import { parseViewRange, viewRangeSearch } from '@/lib/patterns/url';

/**
 * Route `#/goals` (goals.md, issue #97): a target value per (view, metric), drawn on the same charts as Analysis —
 * same views, same date range, same `sessionTrend`/`trendMetrics` pipeline. The goal's own history is the chart's
 * existing x-axis (a step line, goals.md §4), so widening the range slider is how you "go back in time" to see
 * what a goal used to be; there is no separate control for it.
 */
export function GoalsPage() {
  const { ctx } = useServices();
  const { value, loading } = useLiveQuery(() => loadPatterns(ctx), [ctx]);
  const [refreshKey, setRefreshKey] = useState(0);
  const { value: entries } = useLiveQuery(() => listGoals(ctx), [ctx, refreshKey]);

  // Issue #72's pattern: the view and range live in the address, same as Patterns and Analysis.
  const [params, setParams] = useSearchParams();
  const { view, range } = parseViewRange(params);
  const setView = (v: PatternView) => setParams(viewRangeSearch(v, range), { replace: true });
  const setRange = (r: PatternRange) => setParams(viewRangeSearch(view, r), { replace: true });

  const kind = view.startsWith('precision') ? 'precision' : 'sighting';
  const trend = useMemo(
    () => (value === undefined ? [] : sessionTrend(filterByRange(value.data.points[view], range, value.today), kind)),
    [value, view, range, kind],
  );
  const metrics = useMemo(() => trendMetrics(kind), [kind]);

  async function handleSetGoal(metricId: (typeof metrics)[number]['id'], newValue: number) {
    await setGoal(ctx, { view, metric: metricId, value: newValue });
    setRefreshKey((k) => k + 1);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 lg:max-w-6xl">
      <h1 className="text-xl font-semibold">Goals</h1>

      <ViewRangeControls view={view} range={range} onView={setView} onRange={setRange} testIdPrefix="goals" />
      <p className="text-xs text-muted-foreground" data-testid="goals-range-hint">
        This also sets how far back you can see a goal's own history — widen it to look further back.
      </p>

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
                  key={`${view}-${range}-${m.id}`}
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
