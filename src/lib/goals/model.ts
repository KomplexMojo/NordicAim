// goals.md §2, §4: pure helpers over the append-only goal log. No clock, no storage.

import type { TrendPoint } from '../analysis/trend';
import type { GoalLogEntry, GoalMetric, GoalView } from '../domain/goals';

/** The entry with this (view, metric) and the latest `setAt`, or null if none exists yet. */
export function currentGoal(entries: readonly GoalLogEntry[], view: GoalView, metric: GoalMetric): GoalLogEntry | null {
  return goalAsOf(entries, view, metric, null);
}

/**
 * The entry with this (view, metric) and the latest `setAt` at or before `atIso` — or, when `atIso` is null, the
 * latest overall. Null before the first entry for that pair. `setAt` is always `UtcIso`, so lexicographic order is
 * chronological order.
 */
export function goalAsOf(entries: readonly GoalLogEntry[], view: GoalView, metric: GoalMetric, atIso: string | null): GoalLogEntry | null {
  let latest: GoalLogEntry | null = null;
  for (const entry of entries) {
    if (entry.view !== view || entry.metric !== metric) continue;
    if (atIso !== null && entry.setAt > atIso) continue;
    if (latest === null || entry.setAt > latest.setAt) latest = entry;
  }
  return latest;
}

/**
 * goals.md §4: the goal in effect as of each session, for the chart's goal step-line — same length and order as
 * `trend`, so it shares x-positions with the data series once both are run through `chartGeometry`. A goal set on
 * a session's own calendar day counts for it (evaluated at that day's end, so a same-day tie favours the new goal).
 */
export function goalSeries(
  entries: readonly GoalLogEntry[],
  view: GoalView,
  metric: GoalMetric,
  trend: readonly TrendPoint[],
): Array<number | null> {
  return trend.map((point) => {
    const asOf = `${point.sessionDate}T23:59:59.999Z`;
    return goalAsOf(entries, view, metric, asOf)?.value ?? null;
  });
}
