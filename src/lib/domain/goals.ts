// goals.md §2: the append-only goal log, one row (`key: 'app'`), the same shape `AppSettings` uses.

import { z } from 'zod';

import { Id, UtcIso } from './primitives';

/** Matches `PatternView` (`src/lib/patterns/collect.ts`); duplicated here since domain schemas don't import UI-adjacent code. */
export const GoalView = z.enum(['sight-in', 'confirm', 'precision-prone', 'precision-standing']);
export type GoalView = z.infer<typeof GoalView>;

/**
 * A subset of `TrendMetricId` (`src/lib/analysis/trend.ts`): MPI left/right and MPI up/down are excluded (owner,
 * 2026-09-30) — a goal is one Y-value on a chart, and MPI's two axes plot a signed *position*, not a single
 * magnitude a star can usefully sit above or below.
 */
export const GoalMetric = z.enum(['score', 'group', 'rms']);
export type GoalMetric = z.infer<typeof GoalMetric>;

/**
 * One goal-setting event. Never edited or deleted: setting a new goal for the same (view, metric) appends another
 * entry rather than changing this one (goals.md §2, §4 — the log itself is the history).
 */
export const GoalLogEntry = z.object({
  id: Id,
  view: GoalView,
  metric: GoalMetric,
  /** The metric's own unit: %, MOA or mm (whatever `TrendMetric.unit` says for this `metric`). */
  value: z.number(),
  setAt: UtcIso,
});
export type GoalLogEntry = z.infer<typeof GoalLogEntry>;

export const GoalsStore = z.object({
  schemaVersion: z.literal(1),
  key: z.literal('app'),
  entries: z.array(GoalLogEntry),
});
export type GoalsStore = z.infer<typeof GoalsStore>;

export function defaultGoalsStore(): GoalsStore {
  return { schemaVersion: 1, key: 'app', entries: [] };
}
