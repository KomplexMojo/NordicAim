import { describe, expect, it } from 'vitest';

import { chartGeometry, leastSquares, MIN_TREND_SESSIONS, niceStep, valueToY } from '@/lib/analysis/chart';

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

describe('chartGeometry with a shared domain (analysis.md §5)', () => {
  it('scales every series on one chart to the same axis', () => {
    const all = [1, 2, 10, 20];
    const a = chartGeometry([1, 2], BOX, false, 4, all);
    const b = chartGeometry([10, 20], BOX, false, 4, all);
    expect(a.domain).toEqual(b.domain);
    expect(a.points[0]!.y).toBeGreaterThan(b.points[0]!.y);
  });
});

describe('trend line (analysis.md §4a, REV-129)', () => {
  const box = { width: 320, height: 170, left: 44, right: 12, top: 12, bottom: 28 };

  it('fits value on session index by least squares, skipping sessions with no value', () => {
    // v = 2i + 1 exactly, with a gap at index 2.
    expect(leastSquares([1, 3, null, 7, 9])).toEqual({ slope: 2, intercept: 1, first: 0, last: 4 });
    // 1, 2, 6 at 0, 1, 2: slope = Σ(i−1)(v−3) / Σ(i−1)² = (2 + 0 + 3) / 2 = 2.5, intercept = 3 − 2.5 = 0.5.
    const fit = leastSquares([1, 2, 6])!;
    expect(fit.slope).toBeCloseTo(2.5, 12);
    expect(fit.intercept).toBeCloseTo(0.5, 12);
  });

  it(`needs ${MIN_TREND_SESSIONS} sessions with a value`, () => {
    expect(MIN_TREND_SESSIONS).toBe(3);
    expect(leastSquares([4, null, 6])).toBeNull();
    expect(chartGeometry([4, null, 6], box, false).trend).toBeNull();
    expect(chartGeometry([4, 5, 6], box, false).trend).not.toBeNull();
  });

  it('runs from the first to the last session with a value, through the fitted values', () => {
    const g = chartGeometry([null, 2, 4, 6], box, false);
    const [first, , last] = g.points;
    expect(g.trend!.slope).toBeCloseTo(2, 12);
    expect(g.trend!.x1).toBeCloseTo(first!.x, 9);
    expect(g.trend!.y1).toBeCloseTo(first!.y, 9);
    expect(g.trend!.x2).toBeCloseTo(last!.x, 9);
    expect(g.trend!.y2).toBeCloseTo(last!.y, 9);
  });

  it('is clipped to the plot when a fitted end falls outside the domain', () => {
    // 0, 0, 0, 10: slope 3, intercept −1.5, so the fit starts at −1.5, below the domain [0, 10].
    const g = chartGeometry([0, 0, 0, 10], box, false);
    expect(g.domain).toEqual([0, 10]);
    const bottom = box.height - box.bottom;
    expect(g.trend!.y1).toBeCloseTo(bottom, 9); // clipped to 0 …
    expect(g.trend!.x1).toBeGreaterThan(g.points[0]!.x); // … where the fitted line crosses it (i = 0.5)
    expect(g.trend!.y2).toBeGreaterThanOrEqual(box.top - 1e-9);
  });

  it('is flat for a flat series', () => {
    const g = chartGeometry([5, 5, 5], box, false);
    expect(g.trend!.slope).toBe(0);
    expect(g.trend!.y1).toBeCloseTo(g.trend!.y2, 12);
  });
});

describe('valueToY (goals.md §5 / M28: placing a marker at a value chartGeometry never plotted)', () => {
  it('matches the y every point in the same domain actually got', () => {
    const g = chartGeometry([1.2, 3.7, 2.5], BOX, false);
    for (const p of g.points) {
      expect(valueToY(p.value, BOX, g.domain)).toBeCloseTo(p.y, 9);
    }
  });

  it('maps the domain\'s max and min to the plot\'s top and bottom edges', () => {
    const g = chartGeometry([1, 9], BOX, false);
    expect(valueToY(g.domain[1], BOX, g.domain)).toBeCloseTo(BOX.top, 9);
    expect(valueToY(g.domain[0], BOX, g.domain)).toBeCloseTo(BOX.height - BOX.bottom, 9);
  });
});
