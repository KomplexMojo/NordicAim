// goals.md §1, §3: the charts Goals draws — three of Analysis's trend metrics plus its own "Biathlon hits" measure.
// Pure: no clock, no storage.

import { change, sessionTrend, trendMetrics, type TrendMetric, type TrendPoint } from '../analysis/trend';
import type { GoalMetric, GoalView } from '../domain/goals';
import type { PatternPoint } from '../patterns/collect';
import { hitsZone } from '../scoring/sighting';

/** A session on a Goals chart: Analysis's trend point plus the Goals-only measure. */
export interface GoalPoint extends TrendPoint {
  /** goals.md §1: the share of this session's shots that would hit the biathlon zone for the view's position, 0..100. */
  zoneHitPercent: number | null;
}

/** A Goals chart: a `TrendMetric`'s shape, keyed by `GoalMetric`, read off a `GoalPoint`. */
export interface GoalTrendMetric extends Omit<TrendMetric, 'id' | 'value'> {
  id: GoalMetric;
  value(point: GoalPoint): number | null;
}

const POSITION: Record<GoalView, 'prone' | 'standing'> = { 'precision-prone': 'prone', 'precision-standing': 'standing' };

/**
 * goals.md §3: every session of the view, oldest first (Analysis's `sessionTrend`), each with its zone-hit share.
 * `holeDiameterMm` is the scoring rule's hole (REV-56), so a hole touching the zone's edge counts as it does in the
 * score.
 */
export function goalTrend(points: readonly PatternPoint[], view: GoalView, holeDiameterMm: number): GoalPoint[] {
  const position = POSITION[view];
  const tally = new Map<string, { hits: number; shots: number }>();
  for (const p of points) {
    const t = tally.get(p.sessionId) ?? { hits: 0, shots: 0 };
    t.shots += 1;
    if (hitsZone(Math.hypot(p.xMm, p.yMm), position, holeDiameterMm)) t.hits += 1;
    tally.set(p.sessionId, t);
  }
  return sessionTrend([...points], 'precision').map((point) => {
    const t = tally.get(point.sessionId);
    return { ...point, zoneHitPercent: t === undefined || t.shots === 0 ? null : (100 * t.hits) / t.shots };
  });
}

const TREND_METRIC_IDS: readonly string[] = ['score', 'group', 'rms'] satisfies GoalMetric[];
function isGoalMetric(m: TrendMetric): m is TrendMetric & { id: GoalMetric } {
  return TREND_METRIC_IDS.includes(m.id);
}

/** goals.md §1: the goal-able charts for a view, in order: Score, Group size, Accuracy (RMS), Biathlon hits. */
export function goalMetrics(view: GoalView): GoalTrendMetric[] {
  const zone = POSITION[view] === 'prone' ? '45 mm prone' : '115 mm standing';
  return [
    ...trendMetrics('precision').filter(isGoalMetric),
    {
      id: 'zoneHit',
      title: 'Biathlon hits',
      note: `Share of shots that would hit the ${zone} zone; a hole touching the edge counts`,
      unit: '%',
      zeroLine: false,
      trendLine: true,
      value: (p) => p.zoneHitPercent,
      format: (v) => `${Math.round(v)}%`,
      formatChange: change(1, '%'),
    },
  ];
}
