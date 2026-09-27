import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { TrendChart } from '@/components/analysis/TrendChart';
import { TrendsImageCard } from '@/components/analysis/TrendsImageCard';
import { ViewRangeControls } from '@/components/patterns/ViewRangeControls';
import { sessionTrend, trendMetrics } from '@/lib/analysis/trend';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { PATTERN_VIEW_LABEL, filterByRange, type PatternRange, type PatternView } from '@/lib/patterns/collect';
import { loadPatterns } from '@/lib/services/patterns';

/**
 * Route `#/analysis` (analysis.md, REV-123, issue #57): how each kind of target trends over time — the same shots, views and
 * date ranges as Patterns, one data point per session. View-only.
 */
export function AnalysisPage() {
  const { ctx } = useServices();
  const { value, loading } = useLiveQuery(() => loadPatterns(ctx), [ctx]);
  const [view, setView] = useState<PatternView>('sight-in');
  const [range, setRange] = useState<PatternRange>('all');

  const kind = view.startsWith('precision') ? 'precision' : 'sighting';
  const trend = useMemo(
    () => (value === undefined ? [] : sessionTrend(filterByRange(value.data.points[view], range, value.today), kind)),
    [value, view, range, kind],
  );
  const metrics = useMemo(() => trendMetrics(kind), [kind]);
  const targets = trend.reduce((n, t) => n + t.targets, 0);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 lg:max-w-6xl">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Analysis</h1>
        <Link to="/" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">
          Home
        </Link>
      </header>

      <ViewRangeControls view={view} range={range} onView={setView} onRange={setRange} testIdPrefix="analysis" />

      {loading && value === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <p className="text-sm font-medium" data-testid="analysis-counts">
            {PATTERN_VIEW_LABEL[view]}: {trend.length} {trend.length === 1 ? 'session' : 'sessions'} · {targets}{' '}
            {targets === 1 ? 'target' : 'targets'}
          </p>
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions here yet.</p>
          ) : (
            <>
              {trend.length === 1 && (
                <p className="text-sm text-muted-foreground" data-testid="analysis-one-session">
                  A trend needs at least two sessions; this range has one.
                </p>
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                {metrics.map((m) => (
                  <TrendChart key={m.id} metric={m} trend={trend} />
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
