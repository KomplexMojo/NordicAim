import { describe, expect, it } from 'vitest';

import type { TrendPoint } from '@/lib/analysis/trend';
import type { GoalLogEntry } from '@/lib/domain/goals';
import { currentGoal, goalAsOf, goalSeries } from '@/lib/goals/model';

function entry(over: Partial<GoalLogEntry> & Pick<GoalLogEntry, 'value' | 'setAt'>): GoalLogEntry {
  return { id: `id-${over.setAt}`, view: 'precision-prone', metric: 'score', ...over };
}

function point(sessionDate: string): TrendPoint {
  return {
    sessionId: sessionDate,
    sessionDate,
    sessionStamp: `${sessionDate}T08:00:00.000Z`,
    targets: 1,
    photoIds: [],
    shots: 10,
    scorePercent: 50,
    groupMoa: 2,
    rmsMm: 15,
    mpiXMm: 0,
    mpiYMm: 0,
  };
}

describe('currentGoal / goalAsOf (goals.md §2)', () => {
  it('is null before any goal is set for that (view, metric) pair', () => {
    expect(currentGoal([], 'precision-prone', 'score')).toBeNull();
  });

  it('is the only entry for that pair, ignoring other views and metrics', () => {
    const entries = [
      entry({ value: 70, setAt: '2026-09-01T00:00:00.000Z' }),
      entry({ value: 2.5, setAt: '2026-09-01T00:00:00.000Z', view: 'precision-standing', metric: 'group' }),
    ];
    expect(currentGoal(entries, 'precision-prone', 'score')?.value).toBe(70);
    expect(currentGoal(entries, 'precision-standing', 'group')?.value).toBe(2.5);
    expect(currentGoal(entries, 'precision-standing', 'score')).toBeNull();
  });

  it('picks the latest setAt when the same pair has been set more than once', () => {
    const entries = [
      entry({ value: 70, setAt: '2026-09-01T00:00:00.000Z' }),
      entry({ value: 80, setAt: '2026-09-20T00:00:00.000Z' }),
    ];
    expect(currentGoal(entries, 'precision-prone', 'score')?.value).toBe(80);
    expect(goalAsOf(entries, 'precision-prone', 'score', '2026-09-10T00:00:00.000Z')?.value).toBe(70);
    expect(goalAsOf(entries, 'precision-prone', 'score', '2026-08-31T00:00:00.000Z')).toBeNull();
    // Exactly at the boundary: "at or before" includes the setAt instant itself.
    expect(goalAsOf(entries, 'precision-prone', 'score', '2026-09-20T00:00:00.000Z')?.value).toBe(80);
  });
});

describe('goalSeries (goals.md §4)', () => {
  it('is null for a session before the first goal, then steps to each later value', () => {
    const entries = [
      entry({ value: 70, setAt: '2026-09-10T00:00:00.000Z' }),
      entry({ value: 80, setAt: '2026-09-20T00:00:00.000Z' }),
    ];
    const trend = [point('2026-09-01'), point('2026-09-10'), point('2026-09-15'), point('2026-09-20'), point('2026-09-25')];
    expect(goalSeries(entries, 'precision-prone', 'score', trend)).toEqual([null, 70, 70, 80, 80]);
  });

  it('is all null when no goal has ever been set for that pair', () => {
    const trend = [point('2026-09-01'), point('2026-09-10')];
    expect(goalSeries([], 'precision-prone', 'score', trend)).toEqual([null, null]);
  });
});
