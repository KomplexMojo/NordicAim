// goals.md §2, §4: pure helpers over the append-only goal log. No clock, no storage.

import type { TrendPoint } from '../analysis/trend';
import type { GoalLogEntry, GoalMetric, GoalView } from '../domain/goals';

/** goals.md §4: which way is better for each goal-able metric. */
export const GOAL_DIRECTION: Record<GoalMetric, 'higher' | 'lower'> = {
  score: 'higher',
  group: 'lower',
  rms: 'lower',
};

/**
 * The entry with this (view, metric) and the latest `setAt`, or null if none exists yet. Earlier entries for the
 * pair stay in the log but are never shown (goals.md §4: only the current goal matters). `setAt` is always
 * `UtcIso`, so lexicographic order is chronological order.
 */
export function currentGoal(entries: readonly GoalLogEntry[], view: GoalView, metric: GoalMetric): GoalLogEntry | null {
  let latest: GoalLogEntry | null = null;
  for (const entry of entries) {
    if (entry.view !== view || entry.metric !== metric) continue;
    if (latest === null || entry.setAt > latest.setAt) latest = entry;
  }
  return latest;
}

export interface GoalProgress {
  /** Sessions created at or after the goal was set that have a value for this metric. */
  sessions: number;
  /** The mean of those sessions' values; null with none. */
  average: number | null;
  /** Whether `average` meets the goal in the metric's better direction; null until a session counts. */
  hit: boolean | null;
}

/**
 * goals.md §4: how the sessions since the goal was set measure up. A session counts if it was created
 * (`sessionStamp`) at or after the goal's `setAt`, so changing the goal starts a fresh window.
 */
export function goalProgress(
  goal: Pick<GoalLogEntry, 'value' | 'setAt'>,
  metric: GoalMetric,
  trend: readonly TrendPoint[],
  value: (point: TrendPoint) => number | null,
): GoalProgress {
  const values = trend.flatMap((p) => {
    const v = p.sessionStamp >= goal.setAt ? value(p) : null;
    return v === null ? [] : [v];
  });
  if (values.length === 0) return { sessions: 0, average: null, hit: null };
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const hit = GOAL_DIRECTION[metric] === 'higher' ? average >= goal.value : average <= goal.value;
  return { sessions: values.length, average, hit };
}
