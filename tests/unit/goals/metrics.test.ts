import { describe, expect, it } from 'vitest';

import { goalMetrics, goalTrend } from '@/lib/goals/metrics';
import type { PatternPoint } from '@/lib/patterns/collect';

function shot(sessionId: string, xMm: number, photoId = `${sessionId}-p`): PatternPoint {
  return {
    xMm,
    yMm: 0,
    ring: null,
    isX: null,
    zone: null,
    photoId,
    sessionId,
    sessionDate: '2026-09-20',
    sessionStamp: `2026-09-20T0${sessionId}:00:00.000Z`,
  } as PatternPoint;
}

describe('goalTrend (goals.md §1: Biathlon hits)', () => {
  it('is the share of each session\'s shots that would hit the 45 mm prone zone, a touching hole counting', () => {
    // Prone zone 22.5 mm + 2.8 mm (half a 5.6 mm hole) = 25.3 mm from the centre.
    const points = [shot('1', 0), shot('1', 25.3), shot('1', 25.4), shot('1', 40), shot('2', 10)];
    const trend = goalTrend(points, 'precision-prone', 5.6);
    expect(trend.map((p) => [p.sessionId, p.zoneHitPercent])).toEqual([
      ['1', 50],
      ['2', 100],
    ]);
  });

  it('reads the 115 mm standing zone on the standing view', () => {
    const points = [shot('1', 40), shot('1', 60.3), shot('1', 60.4), shot('1', 80)];
    expect(goalTrend(points, 'precision-standing', 5.6)[0]?.zoneHitPercent).toBe(50);
  });

  it('follows the scoring rule\'s hole: centre in ring (0) reads the zone edge itself', () => {
    const points = [shot('1', 22.5), shot('1', 22.6)];
    expect(goalTrend(points, 'precision-prone', 0)[0]?.zoneHitPercent).toBe(50);
  });

  it('keeps Analysis\'s own per-session values', () => {
    const [p] = goalTrend([shot('1', 3), shot('1', -3)], 'precision-prone', 5.6);
    expect(p?.shots).toBe(2);
    expect(p?.rmsMm).toBeCloseTo(3, 9);
  });
});

describe('goalMetrics (goals.md §1)', () => {
  it('is Score, Group size, Accuracy (RMS) and Biathlon hits, in that order', () => {
    expect(goalMetrics('precision-prone').map((m) => m.id)).toEqual(['score', 'group', 'rms', 'zoneHit']);
  });

  it('names the zone for the view', () => {
    const note = (v: 'precision-prone' | 'precision-standing') => goalMetrics(v).find((m) => m.id === 'zoneHit')?.note;
    expect(note('precision-prone')).toContain('45 mm prone');
    expect(note('precision-standing')).toContain('115 mm standing');
  });
});
