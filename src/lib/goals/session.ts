// goals.md §8: whether a session met the goals in effect when it was created, judged on its own values. Pure: no
// clock, no storage.

import { GoalView, type GoalLogEntry, type GoalMetric } from '../domain/goals';
import type { PatternPoint, PatternView } from '../patterns/collect';
import { goalMetrics, goalTrend } from './metrics';
import { goalInEffect, meetsGoal } from './model';

export interface GoalCheck {
  metric: GoalMetric;
  /** The goal in effect when the session was created, in the metric's own unit. */
  goal: number;
  /** This session's own value (the point the Goals chart plots for it); null when it has none (e.g. one shot's group). */
  value: number | null;
  /** Met in the metric's better direction; null with no value. */
  met: boolean | null;
}

export interface ViewGoalChecks {
  view: GoalView;
  /** One per goal that was in effect, in `goalMetrics` order. */
  checks: GoalCheck[];
  /** Every goal in effect was met (the summary image's badge). */
  allMet: boolean;
}

/** Per goal view: the session's checks, or absent when it has no shots there or no goal was in effect. */
export type SessionGoalChecks = Partial<Record<GoalView, ViewGoalChecks>>;

/**
 * The session's checks for each goal view. `points` are Patterns' points (`collectPatterns`), any sessions; only this
 * session's are read. `holeDiameterMm` is the scoring rule's (REV-56), as on the Goals screen.
 */
export function sessionGoalChecks(
  entries: readonly GoalLogEntry[],
  points: Record<PatternView, readonly PatternPoint[]>,
  session: { id: string; createdAt: string },
  holeDiameterMm: number,
): SessionGoalChecks {
  const out: SessionGoalChecks = {};
  for (const view of GoalView.options) {
    const mine = points[view].filter((p) => p.sessionId === session.id);
    const point = goalTrend(mine, view, holeDiameterMm)[0];
    if (point === undefined) continue;
    const checks: GoalCheck[] = [];
    for (const metric of goalMetrics(view)) {
      const goal = goalInEffect(entries, view, metric.id, session.createdAt);
      if (goal === null) continue;
      const value = metric.value(point);
      checks.push({ metric: metric.id, goal: goal.value, value, met: value === null ? null : meetsGoal(metric.id, value, goal.value) });
    }
    if (checks.length > 0) out[view] = { view, checks, allMet: checks.every((c) => c.met === true) };
  }
  return out;
}

/** goals.md §8: "Score 89% / 85% ✓" — a check as the summary image and the screens word it. */
export function goalCheckLabel(view: GoalView, check: GoalCheck): { title: string; value: string; goal: string } {
  const metric = goalMetrics(view).find((m) => m.id === check.metric)!;
  return { title: metric.title, value: check.value === null ? '—' : metric.format(check.value), goal: metric.format(check.goal) };
}

