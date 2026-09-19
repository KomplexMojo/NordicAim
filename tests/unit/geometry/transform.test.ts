import { describe, expect, it } from 'vitest';

import { mmToPx, pxToMm, scaleCalibration } from '@/lib/geometry/transform';
import type { Calibration } from '@/lib/domain/photo';

const sightingCal: Calibration = {
  cx: 1000,
  cy: 800,
  radiusPx: 460,
  axisRatio: 1,
  angleDeg: 0,
  anchorDiameterMm: 115,
  source: 'overlay',
  confidence: null,
  perspective: null,
};

describe('geometry/transform', () => {
  it('mmToPx: origin maps to the calibration centre', () => {
    expect(mmToPx({ xMm: 0, yMm: 0 }, sightingCal)).toEqual({ x: 1000, y: 800 });
  });

  it('mmToPx: axisRatio 1, angle 0', () => {
    const p = mmToPx({ xMm: 10, yMm: 5 }, sightingCal);
    expect(p.x).toBeCloseTo(1080, 6);
    expect(p.y).toBeCloseTo(760, 6);
  });

  it('pxToMm inverts mmToPx (axisRatio 1, angle 0)', () => {
    const mm = pxToMm({ x: 1080, y: 760 }, sightingCal);
    expect(mm.xMm).toBeCloseTo(10, 6);
    expect(mm.yMm).toBeCloseTo(5, 6);
  });

  it('mmToPx: axisRatio 0.5, angle 90 — major axis is image-vertical', () => {
    const cal: Calibration = { ...sightingCal, axisRatio: 0.5, angleDeg: 90 };
    const p = mmToPx({ xMm: 10, yMm: 5 }, cal);
    expect(p.x).toBeCloseTo(1040, 6);
    expect(p.y).toBeCloseTo(760, 6);
  });

  it('pxToMm inverts mmToPx (axisRatio 0.5, angle 90)', () => {
    const cal: Calibration = { ...sightingCal, axisRatio: 0.5, angleDeg: 90 };
    const mm = pxToMm({ x: 1040, y: 760 }, cal);
    expect(mm.xMm).toBeCloseTo(10, 6);
    expect(mm.yMm).toBeCloseTo(5, 6);
  });

  it('property: pxToMm(mmToPx(p)) ≈ p for 100 random points and random calibrations', () => {
    // seeded PRNG (mulberry32) for determinism — pure modules never call Math.random()
    let seed = 0x2f6e2b1;
    function rand(): number {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    for (let i = 0; i < 100; i++) {
      const cal: Calibration = {
        cx: (rand() - 0.5) * 2000,
        cy: (rand() - 0.5) * 2000,
        radiusPx: 100 + rand() * 900,
        axisRatio: 0.31 + rand() * 0.69,
        angleDeg: rand() * 179.999,
        anchorDiameterMm: 112.4,
        source: 'auto',
        confidence: null,
        perspective: null,
      };
      const p = { xMm: (rand() - 0.5) * 100, yMm: (rand() - 0.5) * 100 };
      const roundTrip = pxToMm(mmToPx(p, cal), cal);
      expect(roundTrip.xMm).toBeCloseTo(p.xMm, 9);
      expect(roundTrip.yMm).toBeCloseTo(p.yMm, 9);
    }
  });

  it('scaleCalibration: capture-overlay §3.4 vector', () => {
    const cal: Calibration = {
      cx: 540,
      cy: 960,
      radiusPx: 274.493,
      axisRatio: 1,
      angleDeg: 0,
      anchorDiameterMm: 112.4,
      source: 'overlay',
      confidence: null,
      perspective: null,
    };
    const scaled = scaleCalibration(cal, 0.5);
    expect(scaled.cx).toBeCloseTo(270, 3);
    expect(scaled.cy).toBeCloseTo(480, 3);
    expect(scaled.radiusPx).toBeCloseTo(137.2465, 3);
    // every other field is carried through unchanged
    expect(scaled.axisRatio).toBe(1);
    expect(scaled.angleDeg).toBe(0);
    expect(scaled.anchorDiameterMm).toBe(112.4);
    expect(scaled.source).toBe('overlay');
    expect(scaled.confidence).toBeNull();
  });
});
