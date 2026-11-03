import { describe, expect, it } from 'vitest';

import type { GoalLogEntry } from '@/lib/domain/goals';
import { goalsCoach, hasAnyGoal } from '@/lib/goals/coach';
import type { PatternPoint } from '@/lib/patterns/collect';
import { accuracyRmse } from '@/lib/scoring/groups';

// goals.md §9 (REV-163): the numbers behind the Goals coach image.

function entry(over: Partial<GoalLogEntry> & Pick<GoalLogEntry, 'value' | 'setAt'>): GoalLogEntry {
  return { id: `${over.view ?? 'precision-prone'}-${over.metric ?? 'score'}-${over.setAt}`, view: 'precision-prone', metric: 'score', ...over };
}

function shot(sessionId: string, date: string, xMm: number, ring: number): PatternPoint {
  return { xMm, yMm: 0, ring, isX: false, zone: null, photoId: `${sessionId}-p`, sessionId, sessionDate: date, sessionStamp: `${date}T10:00:00.000Z` };
}

// Prone: three sessions, score 30%, 100%, 70%, each two shots 1 mm apart (a tiny group). Standing: s1 only, 10 mm off.
const prone = [
  shot('s1', '2026-09-20', 0, 3),
  shot('s1', '2026-09-20', 1, 3),
  shot('s2', '2026-09-28', 0, 10),
  shot('s2', '2026-09-28', 1, 10),
  shot('s3', '2026-10-02', 0, 7),
  shot('s3', '2026-10-02', 1, 7),
];
const standing = [shot('s1', '2026-09-20', 10, 8), shot('s1', '2026-09-20', 10, 8)];
const entries = [
  entry({ metric: 'score', value: 80, setAt: '2026-09-25T00:00:00.000Z' }),
  entry({ metric: 'group', value: 100, setAt: '2026-09-01T00:00:00.000Z' }),
  entry({ view: 'precision-standing', metric: 'rms', value: 0.1, setAt: '2026-09-01T00:00:00.000Z' }),
];
const coach = goalsCoach(entries, { 'precision-prone': prone, 'precision-standing': standing }, 5.6);

describe('goalsCoach (goals.md §9)', () => {
  it('averages each goal over the sessions since it was set, and says which of them met it', () => {
    const score = coach.views[0]!.metrics.find((m) => m.metric === 'score')!;
    expect(score.progress).toEqual({ sessions: 2, average: 85, hit: true });
    expect(score.since.map((s) => [s.sessionId, s.value, s.met])).toEqual([
      ['s2', 100, true],
      ['s3', 70, false],
    ]);
    expect(score.gap).toBeNull();
    expect(score.trend).toBeNull(); // fewer than three sessions
  });

  it('gives how far is left to go while a goal is not yet hit', () => {
    const rms = coach.views[1]!.metrics.find((m) => m.metric === 'rms')!;
    expect(rms.progress?.hit).toBe(false);
    expect(rms.gap).toBeCloseTo(accuracyRmse(standing)! - 0.1, 9);
  });

  it('counts goals set, judged and hit, per view and in all', () => {
    expect(coach.views.map((v) => [v.set, v.judged, v.hit])).toEqual([
      [2, 2, 2],
      [1, 1, 0],
    ]);
    expect([coach.set, coach.judged, coach.hit]).toEqual([3, 3, 2]);
    expect(coach.views[0]!.metrics.find((m) => m.metric === 'rms')!.goal).toBeNull();
  });

  it('judges each session on the goals in effect when it was shot, and gives the latest one', () => {
    // s1: group met, standing RMS not; s2: score and group met; s3: score not met.
    expect(coach.sessionsWithGoals).toBe(3);
    expect(coach.sessionsAllMet).toBe(1);
    expect(coach.latest).toEqual({ sessionDate: '2026-10-02', views: [{ view: 'precision-prone', met: 1, of: 2 }], allMet: false });
  });

  it('counts a goal with no session since it was set as waiting, not judged', () => {
    const later = goalsCoach([entry({ value: 50, setAt: '2026-11-01T00:00:00.000Z' })], { 'precision-prone': prone, 'precision-standing': [] }, 5.6);
    expect([later.set, later.judged, later.hit]).toEqual([1, 0, 0]);
    expect(later.views[0]!.metrics[0]!.progress).toEqual({ sessions: 0, average: null, hit: null });
  });
});

describe('hasAnyGoal', () => {
  it('counts only goals the Goals screen shows, not entries from before the narrowing', () => {
    expect(hasAnyGoal([])).toBe(false);
    expect(hasAnyGoal([entry({ view: 'sight-in', value: 80, setAt: '2026-09-01T00:00:00.000Z' })])).toBe(false);
    expect(hasAnyGoal([entry({ metric: 'mpiX', value: 0, setAt: '2026-09-01T00:00:00.000Z' })])).toBe(false);
    expect(hasAnyGoal(entries)).toBe(true);
  });
});
