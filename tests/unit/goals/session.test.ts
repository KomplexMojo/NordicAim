import { describe, expect, it } from 'vitest';

import type { GoalLogEntry } from '@/lib/domain/goals';
import { goalInEffect } from '@/lib/goals/model';
import { goalCheckLabel, sessionGoalChecks } from '@/lib/goals/session';
import type { PatternPoint, PatternView } from '@/lib/patterns/collect';

function entry(over: Partial<GoalLogEntry> & Pick<GoalLogEntry, 'value' | 'setAt'>): GoalLogEntry {
  return { id: `id-${over.setAt}-${over.metric ?? 'score'}`, view: 'precision-prone', metric: 'score', ...over };
}

function shot(sessionId: string, createdAt: string, xMm: number, ring: number, yMm = 0): PatternPoint {
  return { xMm, yMm, ring, isX: false, zone: null, photoId: `${sessionId}-p`, sessionId, sessionDate: createdAt.slice(0, 10), sessionStamp: createdAt };
}

const S1 = { id: 's1', createdAt: '2026-09-20T10:00:00.000Z' };
const S2 = { id: 's2', createdAt: '2026-09-28T10:00:00.000Z' };

function points(prone: PatternPoint[], standing: PatternPoint[] = []): Record<PatternView, PatternPoint[]> {
  return { 'sight-in': [], confirm: [], 'precision-prone': prone, 'precision-standing': standing };
}

describe('goalInEffect (goals.md §8)', () => {
  const entries = [entry({ value: 70, setAt: '2026-09-01T00:00:00.000Z' }), entry({ value: 80, setAt: '2026-09-25T00:00:00.000Z' })];

  it('is the latest goal set at or before the moment, never a later one', () => {
    expect(goalInEffect(entries, 'precision-prone', 'score', S1.createdAt)?.value).toBe(70);
    expect(goalInEffect(entries, 'precision-prone', 'score', S2.createdAt)?.value).toBe(80);
    expect(goalInEffect(entries, 'precision-prone', 'score', '2026-09-25T00:00:00.000Z')?.value).toBe(80); // inclusive
    expect(goalInEffect(entries, 'precision-prone', 'score', '2026-08-01T00:00:00.000Z')).toBeNull();
  });
});

describe('sessionGoalChecks (goals.md §8)', () => {
  // Ten prone shots for S2: nine 10s and one 9 → Score 99%; all inside the prone zone.
  const s2Prone = [...Array.from({ length: 9 }, (_, i) => shot('s2', S2.createdAt, i * 0.1, 10)), shot('s2', S2.createdAt, 8, 9)];
  // An earlier session's poor shots must not leak into S2's checks.
  const s1Prone = [shot('s1', S1.createdAt, 60, 3), shot('s1', S1.createdAt, -60, 3)];

  it('judges the session on its own values against the goals in effect when it was created', () => {
    const entries = [
      entry({ value: 95, setAt: '2026-09-21T00:00:00.000Z' }), // in effect for S2
      entry({ value: 100, setAt: '2026-09-29T00:00:00.000Z' }), // set after S2: ignored
      entry({ value: 90, setAt: '2026-09-21T00:00:00.000Z', metric: 'zoneHit' }),
    ];
    const checks = sessionGoalChecks(entries, points([...s1Prone, ...s2Prone]), S2, 5.6);
    expect(checks['precision-prone']).toEqual({
      view: 'precision-prone',
      checks: [
        { metric: 'score', goal: 95, value: 99, met: true },
        { metric: 'zoneHit', goal: 90, value: 100, met: true },
      ],
      allMet: true,
    });
    expect(checks['precision-standing']).toBeUndefined(); // no standing shots
  });

  it('is not all met when any goal is missed, and lower is better for group size', () => {
    const entries = [entry({ value: 95, setAt: '2026-09-21T00:00:00.000Z' }), entry({ value: 0.1, setAt: '2026-09-21T00:00:00.000Z', metric: 'group' })];
    const view = sessionGoalChecks(entries, points(s2Prone), S2, 5.6)['precision-prone']!;
    expect(view.checks.map((c) => [c.metric, c.met])).toEqual([
      ['score', true],
      ['group', false],
    ]);
    expect(view.allMet).toBe(false);
  });

  it('has no checks for a view with no goal in effect yet', () => {
    const entries = [entry({ value: 95, setAt: '2026-09-29T00:00:00.000Z' })];
    expect(sessionGoalChecks(entries, points(s2Prone), S2, 5.6)).toEqual({});
  });

  it('a metric the session has no value for reads "—" and is not met', () => {
    const entries = [entry({ value: 2, setAt: '2026-09-21T00:00:00.000Z', metric: 'group' })];
    const view = sessionGoalChecks(entries, points([shot('s2', S2.createdAt, 1, 10)]), S2, 5.6)['precision-prone']!;
    expect(view.checks).toEqual([{ metric: 'group', goal: 2, value: null, met: null }]);
    expect(view.allMet).toBe(false);
    expect(goalCheckLabel('precision-prone', view.checks[0]!)).toEqual({ title: 'Group size', value: '—', goal: '2.00 MOA' });
  });
});
