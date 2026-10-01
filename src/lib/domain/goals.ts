// goals.md §2: the append-only goal log, one row (`key: 'app'`), the same shape `AppSettings` uses.

import { z } from 'zod';

import { Id, UtcIso } from './primitives';

/**
 * A subset of `PatternView` (`src/lib/patterns/collect.ts`; duplicated here since domain schemas don't import
 * UI-adjacent code): Sight in and Confirm are excluded (owner, 2026-09-30) — a goal doesn't make sense for those
 * views the way it does for the two precision ones.
 */
export const GoalView = z.enum(['precision-prone', 'precision-standing']);
export type GoalView = z.infer<typeof GoalView>;

/**
 * A subset of `TrendMetricId` (`src/lib/analysis/trend.ts`): MPI left/right and MPI up/down are excluded (owner,
 * 2026-09-30) — a goal is one Y-value on a chart, and MPI's two axes plot a signed *position*, not a single
 * magnitude a star can usefully sit above or below.
 */
export const GoalMetric = z.enum(['score', 'group', 'rms']);
export type GoalMetric = z.infer<typeof GoalMetric>;

// Every view and metric an entry has ever been written with. The log is append-only, so entries saved before Goals
// narrowed to `GoalView`/`GoalMetric` (Sight in, Confirm, MPI) are still stored and must still parse; validating
// stored rows against the narrowed sets made one old entry fail the whole row, so every read and write threw.
// They stay readable and inert: nothing on the Goals screen asks for those pairs.
const StoredGoalView = z.enum(['sight-in', 'confirm', 'precision-prone', 'precision-standing']);
const StoredGoalMetric = z.enum(['score', 'group', 'rms', 'mpiX', 'mpiY']);

/**
 * One goal-setting event. Never edited or deleted: setting a new goal for the same (view, metric) appends another
 * entry rather than changing this one (goals.md §2, §4 — the log itself is the history). New entries are written
 * only for `GoalView` × `GoalMetric` (`services/goals.ts`).
 */
export const GoalLogEntry = z.object({
  id: Id,
  view: StoredGoalView,
  metric: StoredGoalMetric,
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
