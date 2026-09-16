import { beforeAll, describe, expect, it } from 'vitest';

import type { OpenCv } from '@/lib/cv/opencv';
import { hintTemplate, medianOf } from '@/lib/cv/template-hint';

import { loadOpenCvForTests } from '../../helpers/opencv';
import { syntheticCalibration, syntheticTargetRgba, type SyntheticTargetSpec } from '../../helpers/synthetic-target';

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

describe('medianOf', () => {
  it('averages the two middle values for even lengths', () => {
    expect(medianOf([5, 1, 3])).toBe(3);
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('hintTemplate (M10 step 5)', () => {
  it('recognises the precision sheet', async () => {
    const img = await syntheticTargetRgba(PRECISION);
    const hint = hintTemplate(cv, img, syntheticCalibration(PRECISION));

    expect(hint.template).toBe('precision');
    expect(hint.confidence).toBeGreaterThan(0);
    expect(hint.confidence).toBeLessThanOrEqual(1);
  }, 30_000);

  it('recognises the sighting sheet', async () => {
    const img = await syntheticTargetRgba(SIGHTING);
    const hint = hintTemplate(cv, img, syntheticCalibration(SIGHTING));

    expect(hint.template).toBe('sighting');
    expect(hint.confidence).toBeGreaterThan(0);
    expect(hint.confidence).toBeLessThanOrEqual(1);
  }, 30_000);
});
