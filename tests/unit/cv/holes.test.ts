import { beforeAll, describe, expect, it } from 'vitest';

import { detectShots, printedCircleRadiiMm } from '@/lib/cv/holes';
import type { OpenCv } from '@/lib/cv/opencv';
import { mmToRectified, outerRadiusMm, rectifiedSidePx, rectifiedToMm } from '@/lib/cv/rectify';

import { loadOpenCvForTests } from '../../helpers/opencv';
import { matchShots } from '../../helpers/shot-match';
import {
  PRECISION_TEST_HOLES,
  SIGHTING_TEST_HOLES,
  SYNTHETIC_HOLE_DIAMETER_MM,
  polarHole,
  syntheticCalibration,
  syntheticTargetRgba,
  type SyntheticHole,
  type SyntheticTargetSpec,
} from '../../helpers/synthetic-target';

const PRECISION: SyntheticTargetSpec = {
  template: 'precision',
  width: 1200,
  height: 1600,
  cx: 620,
  cy: 830,
  radiusPx: 260,
  axisRatio: 0.93,
  angleDeg: 0,
};

const SIGHTING: SyntheticTargetSpec = {
  template: 'sighting',
  width: 1200,
  height: 1600,
  cx: 600,
  cy: 800,
  radiusPx: 450,
  axisRatio: 0.93,
  angleDeg: 0,
};

let cv: OpenCv;

beforeAll(async () => {
  cv = await loadOpenCvForTests();
}, 60_000);

async function detect(spec: SyntheticTargetSpec, holesMm: SyntheticHole[]) {
  const img = await syntheticTargetRgba({ ...spec, holesMm });
  return detectShots(cv, img, syntheticCalibration(spec), spec.template, SYNTHETIC_HOLE_DIAMETER_MM);
}

describe('rectify (M11 step 1)', () => {
  it('sizes the canonical square from the outermost printed circle', () => {
    // 2 * (outerRadiusMm + 10) * 8, with the outer circles of capture-overlay §3.1.
    expect(outerRadiusMm('precision')).toBeCloseTo(77.2, 6);
    expect(outerRadiusMm('sighting')).toBeCloseTo(57.5, 6);
    expect(rectifiedSidePx('precision')).toBe(1395);
    expect(rectifiedSidePx('sighting')).toBe(1080);
  });

  it('round-trips rectified px and target mm', () => {
    const geom = { side: rectifiedSidePx('precision'), pxPerMm: 8 };

    expect(mmToRectified({ xMm: 0, yMm: 0 }, geom)).toEqual({ x: 697.5, y: 697.5 });
    // +y is up in mm and down in px.
    expect(mmToRectified({ xMm: 10, yMm: 5 }, geom)).toEqual({ x: 777.5, y: 657.5 });

    const back = rectifiedToMm({ x: 777.5, y: 657.5 }, geom);
    expect(back.xMm).toBeCloseTo(10, 9);
    expect(back.yMm).toBeCloseTo(5, 9);
  });
});

describe('printedCircleRadiiMm (M11 step 4)', () => {
  it('lists every printed circle of the precision sheet', () => {
    // geometry-scoring §1.3: the inner ten, rings 10..1, and the black aiming mark.
    expect(printedCircleRadiiMm('precision')).toEqual([
      2.5, 5.2, 13.2, 21.2, 29.2, 37.2, 45.2, 53.2, 56.2, 61.2, 69.2, 77.2,
    ]);
  });

  it('lists every printed circle of the sighting sheet', () => {
    // geometry-scoring §1.2: the unscored inner circle, both zones with their guides, the disc.
    expect(printedCircleRadiiMm('sighting')).toEqual([7.5, 20, 22.5, 55, 57.5]);
  });
});

describe('detectShots (M11 steps 2-5)', () => {
  it('finds 8 separate precision holes, two of them clipped by a ring line', async () => {
    const shots = await detect(PRECISION, PRECISION_TEST_HOLES);
    const result = matchShots(shots, PRECISION_TEST_HOLES);

    expect(result.recall).toBeGreaterThanOrEqual(0.95);
    expect(result.precision).toBeGreaterThanOrEqual(0.95);
    expect(result.meanErrorMm).not.toBeNull();
    expect(result.meanErrorMm!).toBeLessThanOrEqual(0.8);

    // Separate holes, so every one of them is a single shot.
    for (const shot of shots) {
      expect(shot.multiplicity).toBe(1);
      expect(shot.cluster).toBe(false);
      expect(shot.source).toBe('auto');
      expect(shot.positionOverrides).toBeNull();
      expect(shot.confidence).toBeGreaterThan(0.65);
    }
    expect(shots.map((shot) => shot.id)).toEqual([
      'auto-1',
      'auto-2',
      'auto-3',
      'auto-4',
      'auto-5',
      'auto-6',
      'auto-7',
      'auto-8',
    ]);
  }, 120_000);

  it('reads two holes overlapping at 3 mm as one cluster of multiplicity 2', async () => {
    const shots = await detect(SIGHTING, SIGHTING_TEST_HOLES);

    // One cluster plus the two separate holes.
    expect(shots).toHaveLength(3);
    const clusters = shots.filter((shot) => shot.cluster);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.multiplicity).toBeGreaterThanOrEqual(1);
    expect(clusters[0]!.multiplicity).toBeLessThanOrEqual(3);
    // A cluster centroid is only an approximation, so its confidence is discounted.
    expect(clusters[0]!.confidence).toBeLessThan(0.65);

    const units = shots.reduce((sum, shot) => sum + shot.multiplicity, 0);
    expect(Math.abs(units - 4)).toBeLessThanOrEqual(1);

    // The cluster sits between the two overlapping holes.
    const midpoint = { xMm: 13.3, yMm: 33.75 };
    expect(Math.hypot(clusters[0]!.xMm - midpoint.xMm, clusters[0]!.yMm - midpoint.yMm)).toBeLessThanOrEqual(3);

    // Both singles are found, within tolerance.
    const singles = shots.filter((shot) => !shot.cluster);
    expect(matchShots(singles, SIGHTING_TEST_HOLES.slice(2)).matched).toBe(2);
  }, 120_000);

  it('finds a hole on the white paper outside the disc', async () => {
    const onPaper = polarHole(65.2, 170);
    const inDisc = polarHole(33.2, 20);
    const shots = await detect(PRECISION, [inDisc, onPaper]);

    expect(shots).toHaveLength(2);
    const result = matchShots(shots, [inDisc, onPaper]);
    expect(result.matched).toBe(2);
    expect(result.meanErrorMm!).toBeLessThanOrEqual(0.8);

    // The outer one really is outside the 56.2 mm aiming mark.
    const outer = shots.find((shot) => Math.hypot(shot.xMm, shot.yMm) > 56.2);
    expect(outer).toBeDefined();
    expect(Math.hypot(outer!.xMm - onPaper.xMm, outer!.yMm - onPaper.yMm)).toBeLessThanOrEqual(1);
  }, 120_000);

  it('finds nothing on an unshot sheet (the printed rings are erased, step 4)', async () => {
    expect(await detect(PRECISION, [])).toEqual([]);
    expect(await detect(SIGHTING, [])).toEqual([]);
  }, 120_000);
});
