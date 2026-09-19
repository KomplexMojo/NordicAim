// M18 / REV-44: geometry-scoring §2.1 step 0 — the calibration's `perspective` — and the M18 Tests
// round trip ("`mmToPx` ∘ `pxToMm` round-trips within 1e-6 mm under the new model").

import { describe, expect, it } from 'vitest';

import { Calibration } from '@/lib/domain/photo';
import { mmToPx, pxToMm, scaleCalibration, type CalibrationLike } from '@/lib/geometry/transform';

const SIGHTING: CalibrationLike = { cx: 1000, cy: 800, radiusPx: 460, axisRatio: 1, angleDeg: 0, anchorDiameterMm: 115 };
const TILT = { p: 0.002, q: 0.004 };

/** mulberry32: deterministic, so the property test never flakes. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('geometry-scoring §2.1 vectors with a perspective', () => {
  it('the target centre still maps to (cx, cy)', () => {
    const p = mmToPx({ xMm: 0, yMm: 0 }, { ...SIGHTING, perspective: TILT });
    expect(p.x).toBeCloseTo(1000, 9);
    expect(p.y).toBeCloseTo(800, 9);
  });

  it('mmToPx({10, 5}) -> {1076.923076923, 761.538461538} (w = 1.04)', () => {
    const p = mmToPx({ xMm: 10, yMm: 5 }, { ...SIGHTING, perspective: TILT });
    expect(p.x).toBeCloseTo(1000 + 80 / 1.04, 9);
    expect(p.y).toBeCloseTo(800 - 40 / 1.04, 9);
    expect(Math.abs(p.x - 1076.923076923)).toBeLessThan(1e-6);
    expect(Math.abs(p.y - 761.538461538)).toBeLessThan(1e-6);
  });

  it('pxToMm({1076.923076923077, 761.538461538462}) -> {10, 5}', () => {
    const mm = pxToMm({ x: 1076.923076923077, y: 761.538461538462 }, { ...SIGHTING, perspective: TILT });
    expect(Math.abs(mm.xMm - 10)).toBeLessThan(1e-6);
    expect(Math.abs(mm.yMm - 5)).toBeLessThan(1e-6);
  });

  it('every existing vector is unchanged with perspective null, absent, or {0, 0}', () => {
    const compressed: CalibrationLike = { ...SIGHTING, axisRatio: 0.5, angleDeg: 90 };
    for (const cal of [SIGHTING, compressed]) {
      const absent = mmToPx({ xMm: 10, yMm: 5 }, cal);
      for (const perspective of [null, { p: 0, q: 0 }]) {
        const with0 = mmToPx({ xMm: 10, yMm: 5 }, { ...cal, perspective });
        // null (and p = q = 0) is bit-for-bit the pre-M18 map: REV-44's "no migration".
        expect(with0).toEqual(absent);
        expect(pxToMm(absent, { ...cal, perspective })).toEqual(pxToMm(absent, cal));
      }
    }
    expect(mmToPx({ xMm: 10, yMm: 5 }, SIGHTING)).toEqual({ x: 1080, y: 760 });
    const r = mmToPx({ xMm: 10, yMm: 5 }, { ...SIGHTING, axisRatio: 0.5, angleDeg: 90 });
    expect(r.x).toBeCloseTo(1040, 9);
    expect(r.y).toBeCloseTo(760, 9);
  });
});

describe('M18 Tests: the round trip under the new model', () => {
  it('pxToMm(mmToPx(p)) within 1e-6 mm for random calibrations and perspectives', () => {
    const rand = prng(18);
    for (let i = 0; i < 500; i += 1) {
      const cal: CalibrationLike = {
        cx: (rand() - 0.5) * 2000,
        cy: (rand() - 0.5) * 2000,
        radiusPx: 100 + rand() * 900,
        axisRatio: 0.31 + rand() * 0.69,
        angleDeg: rand() * 179.999,
        anchorDiameterMm: rand() < 0.5 ? 115 : 112.4,
        perspective: { p: (rand() - 0.5) * 2e-3, q: (rand() - 0.5) * 2e-3 },
      };
      const p = { xMm: (rand() - 0.5) * 160, yMm: (rand() - 0.5) * 160 };
      const back = pxToMm(mmToPx(p, cal), cal);
      expect(Math.abs(back.xMm - p.xMm)).toBeLessThan(1e-6);
      expect(Math.abs(back.yMm - p.yMm)).toBeLessThan(1e-6);
    }
  });
});

describe('scaleCalibration leaves the perspective alone (capture-overlay §3.3)', () => {
  it('scaling the image scales every mapped pixel and nothing else', () => {
    const cal: CalibrationLike = { ...SIGHTING, axisRatio: 0.83, angleDeg: 31, perspective: { p: 4e-4, q: -9e-4 } };
    const factor = 0.37;
    const scaled = scaleCalibration(cal, factor);
    expect(scaled.perspective).toEqual(cal.perspective);
    for (const p of [
      { xMm: 0, yMm: 0 },
      { xMm: 5.2, yMm: 0 },
      { xMm: -40, yMm: 61 },
      { xMm: 77, yMm: -20 },
    ]) {
      const a = mmToPx(p, cal);
      const b = mmToPx(p, scaled);
      expect(b.x).toBeCloseTo(a.x * factor, 9);
      expect(b.y).toBeCloseTo(a.y * factor, 9);
    }
  });
});

describe('data-model §3: the stored shape', () => {
  const stored = {
    cx: 620,
    cy: 838,
    radiusPx: 265,
    axisRatio: 0.934,
    angleDeg: 0,
    anchorDiameterMm: 112.4,
    source: 'auto',
    confidence: 0.9,
  };

  it('a calibration stored before M18 reads with perspective null (no migration)', () => {
    expect(Calibration.parse(stored).perspective).toBeNull();
  });

  it('a stored perspective round-trips', () => {
    expect(Calibration.parse({ ...stored, perspective: { p: 1e-4, q: -3e-4 } }).perspective).toEqual({ p: 1e-4, q: -3e-4 });
    expect(Calibration.safeParse({ ...stored, perspective: { p: 'x', q: 0 } }).success).toBe(false);
  });
});
