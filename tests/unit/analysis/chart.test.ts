import { describe, expect, it } from 'vitest';

import { chartGeometry, niceStep } from '@/lib/analysis/chart';

// analysis.md §4 (REV-123).
const BOX = { width: 300, height: 160, left: 40, right: 10, top: 10, bottom: 30 };

describe('niceStep', () => {
  it('rounds to 1, 2 or 5 × 10^n', () => {
    expect(niceStep(10, 4)).toBe(5); // 2.5 -> 5
    expect(niceStep(1, 4)).toBe(0.5); // 0.25 -> 0.5
    expect(niceStep(7, 4)).toBe(2); // 1.75 -> 2
    expect(niceStep(40, 4)).toBe(10);
    expect(niceStep(0, 4)).toBe(1);
  });
});

describe('chartGeometry', () => {
  it('spaces sessions evenly across the plot, oldest on the left', () => {
    const g = chartGeometry([1, 2, 3], BOX, false);
    expect(g.points.map((p) => p.x)).toEqual([40, 165, 290]);
    expect(g.points[0]!.y).toBeGreaterThan(g.points[2]!.y); // higher values sit higher
  });

  it('centres a single session', () => {
    expect(chartGeometry([5], BOX, false).points[0]!.x).toBe(165);
  });

  it('rounds the domain out to ticks that cover every value', () => {
    const g = chartGeometry([1.2, 3.7], BOX, false);
    expect(g.domain[0]).toBeLessThanOrEqual(1.2);
    expect(g.domain[1]).toBeGreaterThanOrEqual(3.7);
    expect(g.yTicks[0]!.value).toBe(g.domain[0]);
    expect(g.yTicks.at(-1)!.value).toBe(g.domain[1]);
    expect(g.yTicks[0]!.y).toBe(BOX.height - BOX.bottom);
    expect(g.yTicks.at(-1)!.y).toBe(BOX.top);
  });

  it('pulls 0 into the domain and draws it when asked', () => {
    const g = chartGeometry([3, 6], BOX, true);
    expect(g.domain[0]).toBe(0);
    expect(g.zeroY).toBe(BOX.height - BOX.bottom);
    expect(chartGeometry([3, 6], BOX, false).zeroY).toBeNull();
  });

  it('breaks the line at a session with no value', () => {
    const g = chartGeometry([1, null, 3, 4], BOX, false);
    expect(g.points.map((p) => p.index)).toEqual([0, 2, 3]);
    expect(g.path.match(/M/g)).toHaveLength(2);
  });

  it('survives all-equal and all-missing values', () => {
    expect(chartGeometry([2, 2], BOX, false).domain[0]).toBeLessThan(2);
    const empty = chartGeometry([null, null], BOX, false);
    expect(empty.points).toEqual([]);
    expect(empty.path).toBe('');
  });
});
