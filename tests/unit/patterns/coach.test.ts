import { describe, expect, it } from 'vitest';

import type { PatternPoint } from '@/lib/patterns/collect';
import { patternsCoach, patternsCoachView, viewPosition } from '@/lib/patterns/coach';
import { ISSUE_IDS } from '@/lib/scoring/characteristics';
import { angular } from '@/lib/scoring/groups';

// patterns.md §7 (REV-163): the numbers behind the Patterns coach image.

function pt(photoId: string, sessionId: string, xMm: number, yMm: number): PatternPoint {
  return { xMm, yMm, ring: 10, isX: false, zone: 'hit', photoId, sessionId, sessionDate: '2026-10-01', sessionStamp: '2026-10-01T10:00:00.000Z' };
}

// Target A: five shots inside a 1 mm square (a tight group). Target B: the same shape 60× larger (a scattered group).
const A = [pt('A', 's1', 0, 0), pt('A', 's1', 1, 0), pt('A', 's1', 0, 1), pt('A', 's1', 1, 1), pt('A', 's1', 0.5, 0.5)];
const B = [pt('B', 's2', 0, 0), pt('B', 's2', 60, 0), pt('B', 's2', 0, 60), pt('B', 's2', 60, 60), pt('B', 's2', 30, 30)];
const options = { handedness: 'right' as const, holeDiameterMm: 5.6 };

describe('patternsCoachView (patterns.md §7)', () => {
  it('gives the typical single target as the median of each target\'s own group size, beside all shots together', () => {
    const v = patternsCoachView('precision-prone', [...A, ...B], options);
    const a = angular(Math.SQRT2, 50_000)!.moa;
    const b = angular(60 * Math.SQRT2, 50_000)!.moa;
    expect(v.targetsSized).toBe(2);
    expect(v.typicalTargetMoa).toBeCloseTo((a + b) / 2, 9);
    expect(v.summary.extremeSpreadMoa).toBeCloseTo(b, 9);
  });

  it('counts the targets that show each issue, and marks the ones all the shots together show', () => {
    const v = patternsCoachView('precision-prone', [...A, ...B], options);
    expect(v.targetsTested).toBe(2);
    const byId = Object.fromEntries(v.issues.map((i) => [i.id, i]));
    expect(byId.tight).toMatchObject({ targets: 1, wholeSet: false });
    expect(byId.scattered).toMatchObject({ targets: 1, wholeSet: true });
  });

  it('lists the most targets first and keeps ties in rule order', () => {
    const v = patternsCoachView('precision-prone', [...A, ...B], options);
    const ids = v.issues.map((i) => i.id);
    const ones = ids.filter((id) => v.issues.find((i) => i.id === id)!.targets === 1);
    expect(ones).toEqual([...ones].sort((x, y) => ISSUE_IDS.indexOf(x as never) - ISSUE_IDS.indexOf(y as never)));
    expect(ids.indexOf('tight')).toBeLessThan(ids.indexOf('scattered'));
    const counts = v.issues.map((i) => i.targets);
    expect(counts).toEqual([...counts].sort((x, y) => y - x));
  });

  it('tests no target below the minimum shot count and has nothing to compare with one target', () => {
    const v = patternsCoachView('precision-standing', A.slice(0, 3), options);
    expect(v.targetsTested).toBe(0);
    expect(v.issues).toEqual([]);
    expect(v.targetsSized).toBe(1);
  });

  it('reads standing for Precision standing and prone for every other view, as the screen does', () => {
    expect(viewPosition('precision-standing')).toBe('standing');
    expect(viewPosition('precision-prone')).toBe('prone');
    expect(viewPosition('sight-in')).toBe('prone');
  });

  it('covers every view in the Analysis coach image\'s order, empty ones too', () => {
    const views = patternsCoach({ 'sight-in': [], confirm: [], 'precision-prone': A, 'precision-standing': [] }, options);
    expect(views.map((v) => v.view)).toEqual(['sight-in', 'confirm', 'precision-prone', 'precision-standing']);
    expect(views[0]!.summary.shots).toBe(0);
    expect(views[0]!.typicalTargetMoa).toBeNull();
  });
});
