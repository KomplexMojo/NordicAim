import { describe, expect, it } from 'vitest';

import { angular, extremeSpread, groupEllipse, meanRadius, mpi, mpiOffset } from '@/lib/scoring/groups';

const DISTANCE_MM = 50000; // BIATHLON_50M distanceM (50) * 1000

describe('scoring/groups mpi', () => {
  it('N = 0 -> null', () => {
    expect(mpi([])).toBeNull();
  });

  it('mean of x and y', () => {
    expect(mpi([{ xMm: 0, yMm: 0 }, { xMm: 4, yMm: 2 }])).toEqual({ xMm: 2, yMm: 1 });
  });
});

describe('scoring/groups extremeSpread', () => {
  it('(0,0),(3,4) -> 5', () => {
    expect(extremeSpread([{ xMm: 0, yMm: 0 }, { xMm: 3, yMm: 4 }])).toBe(5);
  });

  it('a single unit -> null', () => {
    expect(extremeSpread([{ xMm: 1, yMm: 1 }])).toBeNull();
  });

  it('(1,1) x3 (identical coordinates) -> null; multiplicity never changes ES', () => {
    expect(extremeSpread([{ xMm: 1, yMm: 1 }, { xMm: 1, yMm: 1 }, { xMm: 1, yMm: 1 }])).toBeNull();
  });

  it('duplicates at one of two distinct coordinates still yield the true spread', () => {
    const units = [{ xMm: 0, yMm: 0 }, { xMm: 0, yMm: 0 }, { xMm: 3, yMm: 4 }];
    expect(extremeSpread(units)).toBe(5);
  });
});

describe('scoring/groups meanRadius', () => {
  it('N = 0 -> null', () => {
    expect(meanRadius([], { xMm: 0, yMm: 0 })).toBeNull();
  });

  it('center null -> null', () => {
    expect(meanRadius([{ xMm: 1, yMm: 1 }], null)).toBeNull();
  });

  it('mean distance from center', () => {
    const units = [{ xMm: 3, yMm: 0 }, { xMm: -3, yMm: 0 }];
    expect(meanRadius(units, { xMm: 0, yMm: 0 })).toBe(3);
  });
});

describe('scoring/groups groupEllipse', () => {
  it('N < 3 -> null', () => {
    expect(groupEllipse([{ xMm: 0, yMm: 0 }, { xMm: 1, yMm: 1 }])).toBeNull();
  });

  it('< 3 distinct coordinates -> null', () => {
    const units = [{ xMm: 0, yMm: 0 }, { xMm: 0, yMm: 0 }, { xMm: 1, yMm: 1 }];
    expect(groupEllipse(units)).toBeNull();
  });

  it('(-1,0),(1,0),(0,2),(0,-2) -> centre (0,0), rx 2.828427, ry 1.414214, angle 90', () => {
    const units = [{ xMm: -1, yMm: 0 }, { xMm: 1, yMm: 0 }, { xMm: 0, yMm: 2 }, { xMm: 0, yMm: -2 }];
    const e = groupEllipse(units)!;
    expect(e.cxMm).toBeCloseTo(0, 6);
    expect(e.cyMm).toBeCloseTo(0, 6);
    expect(e.rxMm).toBeCloseTo(2.828427, 6);
    expect(e.ryMm).toBeCloseTo(1.414214, 6);
    expect(e.angleDeg).toBeCloseTo(90, 6);
  });

  it('(1,1),(2,2),(3,3) -> angle 45, ry 0 (still returned, only the all-zero case is null)', () => {
    const units = [{ xMm: 1, yMm: 1 }, { xMm: 2, yMm: 2 }, { xMm: 3, yMm: 3 }];
    const e = groupEllipse(units)!;
    expect(e).not.toBeNull();
    expect(e.angleDeg).toBeCloseTo(45, 6);
    expect(e.ryMm).toBeCloseTo(0, 9);
  });

  it('angleDeg is normalised to [0, 180)', () => {
    const units = [{ xMm: -1, yMm: 0 }, { xMm: 1, yMm: 0 }, { xMm: 0, yMm: 2 }, { xMm: 0, yMm: -2 }];
    const e = groupEllipse(units)!;
    expect(e.angleDeg).toBeGreaterThanOrEqual(0);
    expect(e.angleDeg).toBeLessThan(180);
  });
});

describe('scoring/groups angular', () => {
  it('sizeMm null -> null', () => {
    expect(angular(null, DISTANCE_MM)).toBeNull();
  });

  it('angular(25) -> moa 1.718873, mrad 0.5', () => {
    const a = angular(25, DISTANCE_MM)!;
    expect(a.moa).toBeCloseTo(1.718873, 5);
    expect(a.mrad).toBeCloseTo(0.5, 6);
  });

  // geometry-scoring.md §7 (top of file): default test tolerance is 1e-6 unless a vector states
  // otherwise. mrad is tested at that default (toBeCloseTo(x, 6), diff < 5e-7). moa is NOT tested at
  // the default: the true value (computed by hand, see the M03 Open questions) is
  // 1.9045116623044323, which differs from the spec's stated 1.904507 by ~4.66e-6 — over the 1e-6
  // default. That mismatch is recorded as an Open question rather than silently loosened; the ±5e-6
  // tolerance used below (toBeCloseTo(x, 5)) is stated explicitly here as the deviation.
  it('angular(27.7) -> moa 1.904507 (tested to ±5e-6, see Open questions), mrad 0.554 (default 1e-6)', () => {
    const a = angular(27.7, DISTANCE_MM)!;
    expect(a.moa).toBeCloseTo(1.904507, 5);
    expect(a.mrad).toBeCloseTo(0.554, 6);
  });

  it('angular(41.9) -> moa 2.880834 (tested to ±5e-6, see Open questions), mrad 0.838 (default 1e-6)', () => {
    const a = angular(41.9, DISTANCE_MM)!;
    expect(a.moa).toBeCloseTo(2.880834, 5);
    expect(a.mrad).toBeCloseTo(0.838, 6);
  });

  it('1 MOA at 50 m ~= 14.5444 mm', () => {
    const a = angular(14.5444, DISTANCE_MM)!;
    expect(a.moa).toBeCloseTo(1.0, 4);
  });
});

describe('scoring/groups mpiOffset', () => {
  it('mpi null -> null', () => {
    expect(mpiOffset(null, DISTANCE_MM)).toBeNull();
  });

  it('carries xMm/yMm through and derives xMoa/yMoa/xMrad/yMrad via atan', () => {
    const offset = mpiOffset({ xMm: 9.7, yMm: 3.85 }, DISTANCE_MM)!;
    expect(offset.xMm).toBe(9.7);
    expect(offset.yMm).toBe(3.85);
    const xRad = Math.atan(9.7 / DISTANCE_MM);
    expect(offset.xMoa).toBeCloseTo(xRad * (180 / Math.PI) * 60, 9);
    expect(offset.xMrad).toBeCloseTo(xRad * 1000, 9);
    const yRad = Math.atan(3.85 / DISTANCE_MM);
    expect(offset.yMoa).toBeCloseTo(yRad * (180 / Math.PI) * 60, 9);
    expect(offset.yMrad).toBeCloseTo(yRad * 1000, 9);
  });
});
