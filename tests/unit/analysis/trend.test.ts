import { describe, expect, it } from 'vitest';

import { sessionTrend, trendMetrics } from '@/lib/analysis/trend';
import type { PatternPoint } from '@/lib/patterns/collect';

// analysis.md §2–§3 (REV-123): one data point per session, oldest first.

function pt(over: Partial<PatternPoint>): PatternPoint {
  return {
    xMm: 0, yMm: 0, ring: 10, isX: false, zone: null, photoId: 't1', sessionId: 'A', sessionDate: '2026-09-01', sessionStamp: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

// 2 × atan(size / 100 m) in minutes of angle: a 10 mm group at 50 m.
const MOA_10MM = 2 * Math.atan(10 / 100_000) * (180 / Math.PI) * 60;

describe('sessionTrend', () => {
  const B = { sessionId: 'B', sessionDate: '2026-09-02', sessionStamp: '2026-09-02T10:00:00.000Z' };
  const points = [
    // Session B first in the input: the output is still oldest first.
    pt({ ...B, photoId: 't2', xMm: 0, yMm: 0, ring: 10 }),
    pt({ ...B, photoId: 't2', xMm: 0, yMm: 20, ring: 8 }),
    pt({ ...B, photoId: 't3', xMm: 5, yMm: 5, ring: 9 }), // one shot: no spread of its own
    pt({ xMm: 0, yMm: 0, ring: 10 }),
    pt({ xMm: 10, yMm: 0, ring: 9 }),
  ];

  it('gives one point per session, oldest first', () => {
    const trend = sessionTrend(points, 'precision');
    expect(trend.map((t) => t.sessionId)).toEqual(['A', 'B']);
    expect(trend.map((t) => [t.targets, t.shots])).toEqual([[1, 2], [2, 3]]);
  });

  it('scores a precision session as its average ring over 10', () => {
    const [a, b] = sessionTrend(points, 'precision');
    expect(a!.scorePercent).toBe(95); // (10 + 9) / 2
    expect(b!.scorePercent).toBe(90); // (10 + 8 + 9) / 3
  });

  it('takes group size as the mean of each target\'s extreme spread, in MOA at 50 m, skipping single-shot targets', () => {
    const [a, b] = sessionTrend(points, 'precision');
    expect(a!.groupMoa).toBeCloseTo(MOA_10MM, 9);
    expect(b!.groupMoa).toBeCloseTo(2 * Math.atan(20 / 100_000) * (180 / Math.PI) * 60, 9); // t2 only
  });

  it('puts the MPI at the mean of every shot in the session', () => {
    const [a, b] = sessionTrend(points, 'precision');
    expect([a!.mpiXMm, a!.mpiYMm]).toEqual([5, 0]);
    expect(b!.mpiXMm).toBeCloseTo(5 / 3, 12);
    expect(b!.mpiYMm).toBeCloseTo(25 / 3, 12);
  });

  it('takes accuracy as the RMS distance of every shot in the session from the bullseye, in mm (REV-128)', () => {
    const [a, b] = sessionTrend(points, 'precision');
    expect(a!.rmsMm).toBeCloseTo(Math.sqrt((0 + 100) / 2), 12); // (0,0), (10,0)
    expect(b!.rmsMm).toBeCloseTo(Math.sqrt((0 + 400 + 50) / 3), 12); // (0,0), (0,20), (5,5): pooled over targets
    const rms = trendMetrics('precision').find((m) => m.id === 'rms')!;
    expect(rms.value(a!)).toBe(a!.rmsMm);
    expect(rms.format(7.071)).toBe('7.1 mm');
    expect(rms.zeroLine).toBe(false);
  });

  it('orders two sessions on one day by when they were created', () => {
    const early = pt({ sessionId: 'E', sessionStamp: '2026-09-01T08:00:00.000Z' });
    const late = pt({ sessionId: 'L', sessionStamp: '2026-09-01T18:00:00.000Z' });
    expect(sessionTrend([late, early], 'precision').map((t) => t.sessionId)).toEqual(['E', 'L']);
  });

  it('scores a sighting session as its share of shots in the hit zone', () => {
    const sighting = [pt({ zone: 'hit', ring: null }), pt({ zone: 'clean', ring: null }), pt({ zone: 'miss', ring: null }), pt({ zone: 'hit', ring: null })];
    expect(sessionTrend(sighting, 'sighting')[0]!.scorePercent).toBe(75);
  });

  it('is empty with no shots, and has no group size when no target has two distinct shots', () => {
    expect(sessionTrend([], 'precision')).toEqual([]);
    expect(sessionTrend([pt({})], 'precision')[0]!.groupMoa).toBeNull();
  });
});

describe('trendMetrics', () => {
  it('names the score by the target kind, and marks only the MPI charts as signed around 0', () => {
    expect(trendMetrics('precision').map((m) => m.title)).toEqual(['Score', 'Group size', 'Accuracy (RMS)', 'MPI left / right', 'MPI up / down']);
    expect(trendMetrics('sighting')[0]!.title).toBe('Hit rate');
    expect(trendMetrics('precision').map((m) => m.zeroLine)).toEqual([false, false, false, true, true]);
  });

  it('formats the MPI with its direction', () => {
    const [, , , x, y] = trendMetrics('precision');
    expect(x!.format(-3.14)).toBe('3.1 mm left');
    expect(x!.format(2)).toBe('2.0 mm right');
    expect(y!.format(-0.5)).toBe('0.5 mm low');
  });
});
