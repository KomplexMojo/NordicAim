import { describe, expect, it } from 'vitest';

import type { TrendPoint } from '@/lib/analysis/trend';
import type { GoalLogEntry } from '@/lib/domain/goals';
import { currentGoal, goalProgress } from '@/lib/goals/model';

function entry(over: Partial<GoalLogEntry> & Pick<GoalLogEntry, 'value' | 'setAt'>): GoalLogEntry {
  return { id: `id-${over.setAt}`, view: 'precision-prone', metric: 'score', ...over };
}

function point(sessionStamp: string, scorePercent: number | null, groupMoa: number | null = 2): TrendPoint {
  return {
    sessionId: sessionStamp,
    sessionDate: sessionStamp.slice(0, 10),
    sessionStamp,
    targets: 1,
    photoIds: [],
    shots: 10,
    scorePercent,
    groupMoa,
    rmsMm: 15,
    mpiXMm: 0,
    mpiYMm: 0,
  };
}

const score = (p: TrendPoint) => p.scorePercent;
const group = (p: TrendPoint) => p.groupMoa;

describe('currentGoal (goals.md §2)', () => {
  it('is null before any goal is set for that (view, metric) pair', () => {
    expect(currentGoal([], 'precision-prone', 'score')).toBeNull();
  });

  it('is the latest entry for that pair, ignoring other views, metrics and older entries', () => {
    const entries = [
      entry({ value: 70, setAt: '2026-09-01T00:00:00.000Z' }),
      entry({ value: 80, setAt: '2026-09-20T00:00:00.000Z' }),
      entry({ value: 2.5, setAt: '2026-09-25T00:00:00.000Z', view: 'precision-standing', metric: 'group' }),
      // Saved by an earlier build, before Goals narrowed its views: stored, never matched.
      entry({ value: 90, setAt: '2026-09-29T00:00:00.000Z', view: 'confirm' }),
    ];
    expect(currentGoal(entries, 'precision-prone', 'score')?.value).toBe(80);
    expect(currentGoal(entries, 'precision-standing', 'group')?.value).toBe(2.5);
    expect(currentGoal(entries, 'precision-standing', 'score')).toBeNull();
  });
});

describe('goalProgress (goals.md §4)', () => {
  const setAt = '2026-09-20T12:00:00.000Z';

  it('counts only sessions created at or after the goal was set, and averages them', () => {
    const trend = [
      point('2026-09-10T08:00:00.000Z', 40), // before the goal: ignored
      point('2026-09-20T12:00:00.000Z', 70), // exactly when it was set: counts
      point('2026-09-25T08:00:00.000Z', 80),
    ];
    expect(goalProgress({ value: 75, setAt }, 'score', trend, score)).toEqual({ sessions: 2, average: 75, hit: true });
  });

  it('is pending (hit null) until a session counts', () => {
    const trend = [point('2026-09-10T08:00:00.000Z', 90)];
    expect(goalProgress({ value: 75, setAt }, 'score', trend, score)).toEqual({ sessions: 0, average: null, hit: null });
  });

  it('skips sessions with no value for the metric', () => {
    const trend = [point('2026-09-21T08:00:00.000Z', null), point('2026-09-22T08:00:00.000Z', 60)];
    expect(goalProgress({ value: 75, setAt }, 'score', trend, score)).toEqual({ sessions: 1, average: 60, hit: false });
  });

  it('reads the better direction from the metric: higher for score, lower for group size and RMS', () => {
    const trend = [point('2026-09-21T08:00:00.000Z', 70, 2.4), point('2026-09-22T08:00:00.000Z', 70, 2.6)];
    expect(goalProgress({ value: 2.5, setAt }, 'group', trend, group).hit).toBe(true); // 2.5 average, at the goal
    expect(goalProgress({ value: 2.4, setAt }, 'group', trend, group).hit).toBe(false);
    expect(goalProgress({ value: 70, setAt }, 'score', trend, score).hit).toBe(true);
    expect(goalProgress({ value: 71, setAt }, 'score', trend, score).hit).toBe(false);
  });
});
