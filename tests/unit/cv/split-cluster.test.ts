import { beforeAll, describe, expect, it } from 'vitest';

import type { OpenCv } from '@/lib/cv/opencv';
import { splitCluster, type PointMm } from '@/lib/cv/split-cluster';

import { loadOpenCvForTests } from '../../helpers/opencv';

let cv: OpenCv;

beforeAll(async () => {
  cv = await loadOpenCvForTests();
}, 60_000);

/** A tiny LCG, so the blobs are pseudo-random but identical on every run (AGENTS.md: determinism). */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** `count` points scattered within `spreadMm` of `centre`. */
function blob(centre: PointMm, count: number, spreadMm: number, random: () => number): PointMm[] {
  const points: PointMm[] = [];
  for (let i = 0; i < count; i += 1) {
    points.push({
      xMm: centre.xMm + (random() - 0.5) * spreadMm,
      yMm: centre.yMm + (random() - 0.5) * spreadMm,
    });
  }
  return points;
}

describe('splitCluster (M11 step 6)', () => {
  it('splits two blobs 6 mm apart into centroids within 1 mm of each', () => {
    const random = makeRandom(20260916);
    const left = { xMm: -3, yMm: 0 };
    const right = { xMm: 3, yMm: 0 };
    const points = [...blob(left, 60, 2.8, random), ...blob(right, 60, 2.8, random)];

    const centres = splitCluster(cv, points, 2);

    expect(centres).toHaveLength(2);
    // Sorted by position, so the left blob comes first.
    expect(Math.hypot(centres[0]!.xMm - left.xMm, centres[0]!.yMm - left.yMm)).toBeLessThanOrEqual(1);
    expect(Math.hypot(centres[1]!.xMm - right.xMm, centres[1]!.yMm - right.yMm)).toBeLessThanOrEqual(1);
  }, 30_000);

  it('splits a vertical pair 6 mm apart too', () => {
    const random = makeRandom(7);
    const lower = { xMm: 10, yMm: -3 };
    const upper = { xMm: 10, yMm: 3 };
    const points = [...blob(lower, 40, 2.5, random), ...blob(upper, 40, 2.5, random)];

    const centres = splitCluster(cv, points, 2);

    expect(centres).toHaveLength(2);
    expect(Math.hypot(centres[0]!.xMm - lower.xMm, centres[0]!.yMm - lower.yMm)).toBeLessThanOrEqual(1);
    expect(Math.hypot(centres[1]!.xMm - upper.xMm, centres[1]!.yMm - upper.yMm)).toBeLessThanOrEqual(1);
  }, 30_000);

  it('returns the plain mean for k = 1', () => {
    const centres = splitCluster(cv, [{ xMm: 0, yMm: 0 }, { xMm: 4, yMm: 2 }], 1);
    expect(centres).toEqual([{ xMm: 2, yMm: 1 }]);
  });

  it('clamps k to the number of points, and returns them as they are', () => {
    const points = [{ xMm: 0, yMm: 0 }, { xMm: 4, yMm: 2 }];
    expect(splitCluster(cv, points, 5)).toEqual(points);
    expect(splitCluster(cv, [], 3)).toEqual([]);
  });
});
