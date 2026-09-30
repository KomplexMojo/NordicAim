import { describe, expect, it } from 'vitest';

import { GoalLogEntry, GoalsStore, defaultGoalsStore } from '@/lib/domain/goals';

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

  it('rejects the MPI metrics: goals were narrowed to score/group/rms (owner, 2026-09-30)', () => {
    const entry = {
      id: '11111111-1111-4111-8111-111111111111',
      view: 'precision-prone',
      metric: 'mpiX',
      value: 0.5,
      setAt: '2026-09-30T12:00:00.000Z',
    };
    expect(GoalLogEntry.safeParse(entry).success).toBe(false);
    expect(GoalLogEntry.safeParse({ ...entry, metric: 'mpiY' }).success).toBe(false);
  });

  it('defaults to an empty entries array', () => {
    expect(defaultGoalsStore()).toEqual({ schemaVersion: 1, key: 'app', entries: [] });
    expect(GoalsStore.safeParse(defaultGoalsStore()).success).toBe(true);
  });
});
