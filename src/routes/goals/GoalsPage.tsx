import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { GoalChart } from '@/components/goals/GoalChart';
import { SeasonFilter } from '@/components/patterns/SeasonFilter';
import { ViewSwitch } from '@/components/patterns/ViewRangeControls';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { GoalView } from '@/lib/domain/goals';
import { goalMetrics, goalTrend } from '@/lib/goals/metrics';
import { parseSeasonFilter, SEASON_LABEL, type SeasonFilter as SeasonFilterValue } from '@/lib/domain/season';
import { PATTERN_VIEW_LABEL, filterBySeason } from '@/lib/patterns/collect';
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
  // REV-154 (issue #29): the season narrows the charts and each goal's "average since set" alike.
  const season = parseSeasonFilter(params.get('season'));
  const search = (v: GoalView, s: SeasonFilterValue) => new URLSearchParams(s === 'all' ? { view: v } : { view: v, season: s });
  const setView = (v: GoalView) => setParams(search(v, season), { replace: true });
  const setSeason = (s: SeasonFilterValue) => setParams(search(view, s), { replace: true });

  const trend = useMemo(
    () => (value === undefined ? [] : goalTrend(filterBySeason(value.data.points[view], season), view, value.holeDiameterMm)),
    [value, view, season],
  );
  const metrics = useMemo(() => goalMetrics(view), [view]);

  async function handleSetGoal(metricId: (typeof metrics)[number]['id'], newValue: number) {
    await setGoal(ctx, { view, metric: metricId, value: newValue });
    setRefreshKey((k) => k + 1);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 lg:max-w-6xl">
      <h1 className="text-xl font-semibold">Goals</h1>

      <ViewSwitch view={view} onView={setView} testIdPrefix="goals" views={GOAL_VIEWS} />
      <SeasonFilter season={season} onSeason={setSeason} testIdPrefix="goals" />

      {loading && value === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <p className="text-sm font-medium" data-testid="goals-counts">
            {PATTERN_VIEW_LABEL[view]}
            {season === 'all' ? '' : ` · ${SEASON_LABEL[season]}`}: {trend.length} {trend.length === 1 ? 'session' : 'sessions'}
          </p>
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions here yet.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {metrics.map((m) => (
                <GoalChart
                  key={`${view}-${season}-${m.id}`}
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
