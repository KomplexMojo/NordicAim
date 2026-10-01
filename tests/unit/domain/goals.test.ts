import { describe, expect, it } from 'vitest';

import { GoalLogEntry, GoalMetric, GoalView, GoalsStore, defaultGoalsStore } from '@/lib/domain/goals';

describe('GoalLogEntry / GoalsStore (goals.md §2)', () => {
  it('parses a well-formed entry and rejects an unknown view or metric', () => {
    const entry = {
      id: '11111111-1111-4111-8111-111111111111',
      view: 'precision-prone',
      metric: 'score',
      value: 70,
      setAt: '2026-09-30T12:00:00.000Z',
    };
    expect(GoalLogEntry.safeParse(entry).success).toBe(true);
    expect(GoalLogEntry.safeParse({ ...entry, view: 'nope' }).success).toBe(false);
    expect(GoalLogEntry.safeParse({ ...entry, metric: 'nope' }).success).toBe(false);
  });

  it('narrows what is goal-able to the precision views and score/group/rms/zoneHit (owner, 2026-09-30, 2026-10-01)', () => {
    expect(GoalView.options).toEqual(['precision-prone', 'precision-standing']);
    expect(GoalMetric.options).toEqual(['score', 'group', 'rms', 'zoneHit']);
    for (const v of ['sight-in', 'confirm']) expect(GoalView.safeParse(v).success).toBe(false);
    for (const m of ['mpiX', 'mpiY']) expect(GoalMetric.safeParse(m).success).toBe(false);
  });

  it('still reads entries saved before that narrowing, so one old entry cannot fail the whole row', () => {
    const old = { id: '11111111-1111-4111-8111-111111111111', value: 90, setAt: '2026-09-29T12:00:00.000Z' };
    expect(GoalLogEntry.safeParse({ ...old, view: 'confirm', metric: 'score' }).success).toBe(true);
    expect(GoalLogEntry.safeParse({ ...old, view: 'sight-in', metric: 'mpiX' }).success).toBe(true);
    expect(GoalLogEntry.safeParse({ ...old, view: 'precision-prone', metric: 'mpiY' }).success).toBe(true);
    const row = { ...defaultGoalsStore(), entries: [{ ...old, view: 'confirm', metric: 'mpiX' }] };
    expect(GoalsStore.safeParse(row).success).toBe(true);
  });

  it('defaults to an empty entries array', () => {
    expect(defaultGoalsStore()).toEqual({ schemaVersion: 1, key: 'app', entries: [] });
    expect(GoalsStore.safeParse(defaultGoalsStore()).success).toBe(true);
  });
});
