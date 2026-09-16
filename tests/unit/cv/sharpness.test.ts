import { beforeAll, describe, expect, it } from 'vitest';

import type { OpenCv } from '@/lib/cv/opencv';
import { sharpness } from '@/lib/cv/sharpness';

import { loadOpenCvForTests } from '../../helpers/opencv';
import { blurRgba } from '../../helpers/rgba';
import { syntheticTargetRgba, type SyntheticTargetSpec } from '../../helpers/synthetic-target';

const SPEC: SyntheticTargetSpec = {
  template: 'precision',
  width: 1200,
  height: 1600,
  cx: 620,
  cy: 830,
  radiusPx: 260,
  axisRatio: 0.93,
  angleDeg: 0,
};

let cv: OpenCv;

beforeAll(async () => {
  cv = await loadOpenCvForTests();
}, 60_000);

describe('sharpness (analysis-pipeline §3)', () => {
  it('drops to at most a third when the same image is blurred with sigma 3', async () => {
    const sharp = await syntheticTargetRgba(SPEC);
    const blurred = await blurRgba(sharp, 3);

    const sharpScore = sharpness(cv, sharp);
    const blurredScore = sharpness(cv, blurred);

    expect(sharpScore).toBeGreaterThan(0);
    expect(blurredScore).toBeLessThanOrEqual(sharpScore / 3);
  }, 60_000);
});
