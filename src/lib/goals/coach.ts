// goals.md §9 (REV-163): the numbers behind the Goals coach image. Every one follows the Goals screen's own rules: the
// current goal (§2), the sessions since it was set and their average (§4), and each session judged against the goal in
// effect when it was shot (§8). Pure: no clock, no storage.

import { trendOf, type AverageBox, type CoachTrend } from '../analysis/coach';
import { GoalView, type GoalLogEntry, type GoalMetric } from '../domain/goals';
import type { PatternPoint } from '../patterns/collect';

import { goalMetrics, goalTrend } from './metrics';
import { currentGoal, GOAL_DIRECTION, goalProgress, meetsGoal, type GoalProgress } from './model';
import { sessionGoalChecks } from './session';

export const GOAL_VIEWS: readonly GoalView[] = GoalView.options;

/** The coach image's trend arrow for a goal metric: Biathlon hits reads like the score (higher is better, in %). */
const ARROW_BOX: Record<GoalMetric, AverageBox> = { score: 'score', group: 'group', rms: 'rms', zoneHit: 'score' };

export interface GoalsCoachSession {
  sessionId: string;
  sessionDate: string;
  value: number;
  /** Met the current goal (which was in effect for every session since it was set). */
  met: boolean;
}

export interface GoalsCoachMetric {
  metric: GoalMetric;
  title: string;
  format(value: number): string;
  unit: string;
  direction: 'higher' | 'lower';
  /** The current goal; null before one is set. */
  goal: { value: number; setAt: string } | null;
  /** §4: the sessions since it was set and whether their average is at or past it; null with no goal. */
  progress: GoalProgress | null;
  /** The sessions since it was set that have a value, oldest first. */
  since: GoalsCoachSession[];
  /** How far the average still is from the goal, in the metric's unit, while it is not yet hit; else null. */
  gap: number | null;
  /** The direction of the sessions since it was set (REV-132's rules), from 3 sessions; null below. */
  trend: CoachTrend | null;
}

export interface GoalsCoachView {
  view: GoalView;
  /** Sessions with shots in this view (in the chosen season). */
  sessions: number;
  metrics: GoalsCoachMetric[];
  /** Goals set; goals with at least one session since they were set (judged); judged goals hit. */
  set: number;
  judged: number;
  hit: number;
}

export interface GoalsCoachLatest {
  sessionDate: string;
  views: Array<{ view: GoalView; met: number; of: number }>;
  allMet: boolean;
}

export interface GoalsCoach {
  views: GoalsCoachView[];
  set: number;
  judged: number;
  hit: number;
  /** §8: sessions that had at least one goal in effect, and those that met every one of them. */
  sessionsWithGoals: number;
  sessionsAllMet: number;
  /** The newest session that had a goal in effect, and how many of its goals it met per view. */
  latest: GoalsCoachLatest | null;
}

/** Whether any goal is set for a view and metric the Goals screen shows (entries from before the narrowing don't count). */
export function hasAnyGoal(entries: readonly GoalLogEntry[]): boolean {
  return GOAL_VIEWS.some((view) => goalMetrics(view).some((m) => currentGoal(entries, view, m.id) !== null));
}

function coachView(entries: readonly GoalLogEntry[], view: GoalView, points: readonly PatternPoint[], holeDiameterMm: number): GoalsCoachView {
  const trend = goalTrend(points, view, holeDiameterMm);
  const metrics = goalMetrics(view).map((m): GoalsCoachMetric => {
    const entry = currentGoal(entries, view, m.id);
    const base = { metric: m.id, title: m.title, format: m.format, unit: m.unit, direction: GOAL_DIRECTION[m.id] };
    if (entry === null) return { ...base, goal: null, progress: null, since: [], gap: null, trend: null };
    const progress = goalProgress(entry, m.id, trend, m.value);
    const since = trend.flatMap((p) => {
      const value = p.sessionStamp >= entry.setAt ? m.value(p) : null;
      return value === null ? [] : [{ sessionId: p.sessionId, sessionDate: p.sessionDate, value, met: meetsGoal(m.id, value, entry.value) }];
    });
    const gap = progress.hit === false && progress.average !== null ? Math.abs(progress.average - entry.value) : null;
    return {
      ...base,
      goal: { value: entry.value, setAt: entry.setAt },
      progress,
      since,
      gap,
      trend: trendOf(
        ARROW_BOX[m.id],
        since.map((s) => s.value),
      ),
    };
  });
  const withGoal = metrics.filter((m) => m.goal !== null);
  const judged = withGoal.filter((m) => m.progress !== null && m.progress.hit !== null);
  return {
    view,
    sessions: trend.length,
    metrics,
    set: withGoal.length,
    judged: judged.length,
    hit: judged.filter((m) => m.progress!.hit === true).length,
  };
}

/**
 * §9: both goal views. `pointsByView` holds Patterns' points for the two views, already narrowed to the chosen season (as
 * the screen's charts and averages are); `holeDiameterMm` is the scoring rule's (REV-56).
 */
export function goalsCoach(
  entries: readonly GoalLogEntry[],
  pointsByView: Record<GoalView, readonly PatternPoint[]>,
  holeDiameterMm: number,
): GoalsCoach {
  const views = GOAL_VIEWS.map((view) => coachView(entries, view, pointsByView[view], holeDiameterMm));

  // §8: each session judged against the goals in effect when it was created, newest last.
  const sessions = new Map<string, { id: string; date: string; createdAt: string }>();
  for (const view of GOAL_VIEWS) {
    for (const p of pointsByView[view]) {
      if (!sessions.has(p.sessionId)) sessions.set(p.sessionId, { id: p.sessionId, date: p.sessionDate, createdAt: p.sessionStamp });
    }
  }
  const ordered = [...sessions.values()].sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));
  const points = { 'sight-in': [], confirm: [], ...pointsByView };
  let sessionsWithGoals = 0;
  let sessionsAllMet = 0;
  let latest: GoalsCoachLatest | null = null;
  for (const s of ordered) {
    const checks = sessionGoalChecks(entries, points, { id: s.id, createdAt: s.createdAt }, holeDiameterMm);
    const perView = GOAL_VIEWS.flatMap((view) => {
      const c = checks[view];
      return c === undefined ? [] : [{ view, met: c.checks.filter((k) => k.met === true).length, of: c.checks.length, allMet: c.allMet }];
    });
    if (perView.length === 0) continue;
    sessionsWithGoals += 1;
    const allMet = perView.every((v) => v.allMet);
    if (allMet) sessionsAllMet += 1;
    latest = { sessionDate: s.date, views: perView.map(({ view, met, of }) => ({ view, met, of })), allMet };
  }

  return {
    views,
    set: views.reduce((t, v) => t + v.set, 0),
    judged: views.reduce((t, v) => t + v.judged, 0),
    hit: views.reduce((t, v) => t + v.hit, 0),
    sessionsWithGoals,
    sessionsAllMet,
    latest,
  };
}
