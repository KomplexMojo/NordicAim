import { useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { TrendChart } from '@/components/analysis/TrendChart';
import { TrendsImageCard } from '@/components/analysis/TrendsImageCard';
import { RangeShowing } from '@/components/patterns/RangeShowing';
import { SeasonFilter } from '@/components/patterns/SeasonFilter';
import { ViewRangeControls } from '@/components/patterns/ViewRangeControls';
import { sessionTrend, trendMetrics } from '@/lib/analysis/trend';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { SEASON_LABEL, type SeasonFilter as SeasonFilterValue } from '@/lib/domain/season';
import { PATTERN_VIEW_LABEL, filterByRange, filterBySeason, type PatternRange, type PatternView } from '@/lib/patterns/collect';
import { loadPatterns } from '@/lib/services/patterns';
import { parseViewRange, viewRangeSearch } from '@/lib/patterns/url';

/**
 * Route `#/analysis` (analysis.md, REV-123, issue #57): how each kind of target trends over time — the same shots, views and
 * ranges as Patterns, one data point per session. View-only.
 */
export function AnalysisPage() {
  const { ctx } = useServices();
  const { value, loading } = useLiveQuery(() => loadPatterns(ctx), [ctx]);
  // Issue #72: the view and range live in the address, so Back from a target opened here returns to them.
  const [params, setParams] = useSearchParams();
  const { view, range, season } = parseViewRange(params);
  const setView = (v: PatternView) => setParams(viewRangeSearch(v, range, season), { replace: true });
  const setRange = (r: PatternRange) => setParams(viewRangeSearch(view, r, season), { replace: true });
  const setSeason = (s: SeasonFilterValue) => setParams(viewRangeSearch(view, range, s), { replace: true });
  const from = { path: `/analysis?${viewRangeSearch(view, range, season)}`, label: 'Back to Analysis' };

  const kind = view.startsWith('precision') ? 'precision' : 'sighting';
  const trend = useMemo(
    () => (value === undefined ? [] : sessionTrend(filterByRange(filterBySeason(value.data.points[view], season), range), kind)),
    [value, view, range, season, kind],
  );
  const metrics = useMemo(() => trendMetrics(kind), [kind]);
  const targets = trend.reduce((n, t) => n + t.targets, 0);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 lg:max-w-6xl">
      {/* REV-136: a tab now, so no Home link of its own: Sessions is the tab beside it. */}
      <h1 className="text-xl font-semibold">Analysis</h1>

      <ViewRangeControls view={view} range={range} onView={setView} onRange={setRange} testIdPrefix="analysis" />
      <SeasonFilter season={season} onSeason={setSeason} testIdPrefix="analysis" />
      {value !== undefined && <RangeShowing range={range} season={season} sessions={trend.length} onSeason={setSeason} testIdPrefix="analysis" />}

      {loading && value === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <p className="text-sm font-medium" data-testid="analysis-counts">
            {PATTERN_VIEW_LABEL[view]}
            {season === 'all' ? '' : ` · ${SEASON_LABEL[season]}`}: {trend.length} {trend.length === 1 ? 'session' : 'sessions'} · {targets}{' '}
            {targets === 1 ? 'target' : 'targets'}
          </p>
          {trend.length === 0 ? (
            // With a season chosen, the sentence above already says none were found and offers every season back.
            season === 'all' && <p className="text-sm text-muted-foreground">No sessions here yet.</p>
          ) : (
            <>
              {trend.length === 1 && (
                <p className="text-sm text-muted-foreground" data-testid="analysis-one-session">
                  A trend needs at least two sessions; this range has one.
                </p>
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                {metrics.map((m) => (
                  <TrendChart key={`${view}-${range}-${season}-${m.id}`} metric={m} trend={trend} from={from} />
                ))}
              </div>
              <details className="text-sm" data-testid="analysis-table">
                <summary className="min-h-11 cursor-pointer py-2 font-medium">Show data</summary>
                <div className="overflow-x-auto">
                  <table className="w-full text-left tabular-nums">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Session</th>
                        <th className="py-1 pr-3 font-medium">Targets</th>
                        {metrics.map((m) => (
                          <th key={m.id} className="py-1 pr-3 font-medium">
                            {m.title}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trend.map((t) => (
                        <tr key={t.sessionId} className="border-t">
                          <td className="py-1 pr-3">{t.sessionDate}</td>
                          <td className="py-1 pr-3">{t.targets}</td>
                          {metrics.map((m) => {
                            const v = m.value(t);
                            return (
                              <td key={m.id} className="py-1 pr-3">
                                {v === null ? '—' : m.format(v)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
          {/* REV-124: a new card per range, so a preview never outlives the range it was made for. */}
          {value !== undefined && Object.values(value.data.points).some((p) => p.length > 0) && <TrendsImageCard key={range} range={range} />}
          {value !== undefined && value.data.leftOut > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="analysis-left-out">
              {value.data.leftOut} {value.data.leftOut === 1 ? 'target' : 'targets'} left out (not analysed, or alignment not
              confirmed).
            </p>
          )}
        </>
      )}
    </main>
  );
}
