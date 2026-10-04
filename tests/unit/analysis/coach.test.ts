import { describe, expect, it } from 'vitest';

import { coachTrends } from '@/lib/analysis/coach';
import type { PatternPoint, PatternView } from '@/lib/patterns/collect';

// analysis.md §5 (REV-124): one session axis for every chart, one aligned series per view.

function pt(sessionId: string, sessionDate: string, over: Partial<PatternPoint> = {}): PatternPoint {
  return { xMm: 0, yMm: 0, ring: 10, isX: false, zone: 'hit', photoId: `${sessionId}-t`, sessionId, sessionDate, sessionStamp: `${sessionDate}T10:00:00.000Z`, ...over };
}

function views(over: Partial<Record<PatternView, PatternPoint[]>>): Record<PatternView, PatternPoint[]> {
  return { 'sight-in': [], confirm: [], 'precision-prone': [], 'precision-standing': [], ...over };
}

describe('coachTrends', () => {
  const data = views({
    'sight-in': [pt('A', '2026-09-01'), pt('C', '2026-09-03')],
    confirm: [pt('B', '2026-09-02')],
    'precision-prone': [pt('A', '2026-09-01', { ring: 8 }), pt('B', '2026-09-02', { ring: 9 }), pt('C', '2026-09-03', { ring: 10 })],
  });

  it('puts every session with shots in any view on one axis, oldest first', () => {
    expect(coachTrends(data).sessions.map((s) => s.sessionId)).toEqual(['A', 'B', 'C']);
  });

  it('gives each metric one series per view, aligned to the axis with gaps where a view was not shot', () => {
    const score = coachTrends(data).metrics.find((m) => m.id === 'score')!;
    const byView = Object.fromEntries(score.series.map((s) => [s.view, s.values]));
    expect(byView['sight-in']).toEqual([100, null, 100]);
    expect(byView.confirm).toEqual([null, 100, null]);
    expect(byView['precision-prone']).toEqual([80, 90, 100]);
    expect(byView['precision-standing']).toEqual([null, null, null]);
  });

  it('keeps the five metrics in order, with zero lines on the MPI charts only', () => {
    const metrics = coachTrends(data).metrics;
    expect(metrics.map((m) => m.id)).toEqual(['score', 'group', 'rms', 'mpiX', 'mpiY']);
    expect(metrics.map((m) => m.zeroLine)).toEqual([false, false, false, true, true]);
    for (const m of metrics) expect(m.series.every((s) => s.values.length === 3)).toBe(true);
  });

  it('is empty with no shots', () => {
    expect(coachTrends(views({})).sessions).toEqual([]);
  });
});
