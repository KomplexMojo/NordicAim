// Issue #72 (REV-140): from a tap on Patterns or Analysis back to the targets behind it.

import { describe, expect, it } from 'vitest';

import { backToFrom } from '@/lib/app/nav';
import type { PatternPoint } from '@/lib/patterns/collect';
import { pickTargets, targetPath } from '@/lib/patterns/pick';
import { parseViewRange, viewRangeSearch } from '@/lib/patterns/url';
import { patternsPxToMm, patternsScale, PATTERNS_SIZE } from '@/lib/render/patterns';

function pt(over: Partial<PatternPoint>): PatternPoint {
  return {
    xMm: 0, yMm: 0, ring: null, isX: null, zone: null, photoId: 't1', sessionId: 'A', sessionDate: '2026-09-01', sessionStamp: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

describe('pickTargets', () => {
  const points = [
    pt({ photoId: 't1', xMm: 0, yMm: 0 }),
    pt({ photoId: 't1', xMm: 1, yMm: 0 }),
    pt({ photoId: 't2', sessionId: 'B', xMm: 2.5, yMm: 0 }),
    pt({ photoId: 't3', sessionId: 'C', xMm: 30, yMm: 30 }),
  ];

  it('lists each target with a shot under the tap once, nearest first, with how many of its shots are there', () => {
    expect(pickTargets(points, 2, 0, 3)).toEqual([
      { sessionId: 'B', photoId: 't2', sessionDate: '2026-09-01', sessionStamp: '2026-09-01T10:00:00.000Z', shots: 1 },
      { sessionId: 'A', photoId: 't1', sessionDate: '2026-09-01', sessionStamp: '2026-09-01T10:00:00.000Z', shots: 2 },
    ]);
  });

  it('finds nothing where there is no shot', () => {
    expect(pickTargets(points, -20, -20, 3)).toEqual([]);
  });

  it('builds the target route', () => {
    expect(targetPath({ sessionId: 'A', photoId: 't1' })).toBe('/sessions/A/photos/t1');
  });
});

describe('patternsPxToMm', () => {
  it('inverts the drawing projection: the centre is (0, 0), +y is up, and one mm is the view scale', () => {
    const s = patternsScale('precision', 1);
    expect(patternsPxToMm('precision', 1, PATTERNS_SIZE / 2, PATTERNS_SIZE / 2)).toEqual({ xMm: 0, yMm: 0 });
    const p = patternsPxToMm('precision', 1, PATTERNS_SIZE / 2 + 10 * s, PATTERNS_SIZE / 2 - 5 * s);
    expect(p.xMm).toBeCloseTo(10, 9);
    expect(p.yMm).toBeCloseTo(5, 9);
  });
});

describe('view and range in the address', () => {
  it('reads what it writes, and falls back to Sight in / Latest session for anything else', () => {
    expect(parseViewRange(new URLSearchParams(viewRangeSearch('confirm', '90')))).toEqual({ view: 'confirm', range: '90', season: 'all' });
    expect(parseViewRange(new URLSearchParams(''))).toEqual({ view: 'sight-in', range: 'last', season: 'all' });
    expect(parseViewRange(new URLSearchParams('view=nope&range=nope'))).toEqual({ view: 'sight-in', range: 'last', season: 'all' });
  });
});

describe('backToFrom', () => {
  it('returns to the Patterns or Analysis view the target was opened from', () => {
    expect(backToFrom({ from: { path: '/analysis?view=confirm&range=90', label: 'Back to Analysis' } }, 'S')).toEqual({
      path: '/analysis?view=confirm&range=90',
      label: 'Back to Analysis',
    });
  });

  it('returns to the Board too (issue #42)', () => {
    expect(backToFrom({ from: { path: '/board?view=precision-standing', label: 'Back to Board' } }, 'S')).toEqual({
      path: '/board?view=precision-standing',
      label: 'Back to Board',
    });
  });

  it("otherwise goes to the session's results, and ignores any other path", () => {
    const results = { path: '/sessions/S/results', label: 'Back to results' };
    expect(backToFrom(null, 'S')).toEqual(results);
    expect(backToFrom({ from: { path: 'https://example.com', label: 'x' } }, 'S')).toEqual(results);
    expect(backToFrom({ from: { path: '/settings', label: 'x' } }, 'S')).toEqual(results);
  });
});
