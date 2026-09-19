import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { detectAnchor } from '@/lib/cv/anchor';
import { TEMPLATE_PERIODICITY_THRESHOLD } from '@/lib/cv/constants';
import type { OpenCv } from '@/lib/cv/opencv';
import { hintTemplate, ringPeriodicity } from '@/lib/cv/template-hint';
import type { TemplateId } from '@/lib/domain/enums';
import type { CalibrationLike } from '@/lib/geometry/transform';

import { loadOpenCvForTests } from '../../helpers/opencv';
import { jpegFileToRgba } from '../../helpers/rgba';
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

/** geometry-scoring §1.2: dashed 110 and 40 mm guides, a solid 45 mm circle, the small inner circle, no rings. */
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

describe('hintTemplate on synthetic sheets (M23)', () => {
  it('recognises the precision sheet', async () => {
    const img = await syntheticTargetRgba(PRECISION);
    const hint = hintTemplate(cv, img, syntheticCalibration(PRECISION));

    expect(hint.template).toBe('precision');
    expect(hint.confidence).toBeGreaterThanOrEqual(0.5);
    expect(hint.confidence).toBeLessThanOrEqual(1);
  }, 30_000);

  it('recognises the precision sheet with its numerals printed', async () => {
    const spec = { ...PRECISION, numeralsDeg: 0 };
    const hint = hintTemplate(cv, await syntheticTargetRgba(spec), syntheticCalibration(spec));

    expect(hint.template).toBe('precision');
    expect(hint.confidence).toBeGreaterThanOrEqual(0.5);
  }, 30_000);

  it('recognises the sighting sheet (dashed 110/40 mm guides, 45 mm circle, no rings)', async () => {
    const img = await syntheticTargetRgba(SIGHTING);
    const hint = hintTemplate(cv, img, syntheticCalibration(SIGHTING));

    expect(hint.template).toBe('sighting');
    // Its thin, sharp dashed guides read a little more periodic than any photo's (M23 Completion notes).
    expect(hint.confidence).toBeGreaterThan(0);
    expect(hint.confidence).toBeLessThanOrEqual(1);
  }, 30_000);

  it('still finds the precision rings when the disc radius is measured 40% too large', async () => {
    const img = await syntheticTargetRgba(PRECISION);
    const cal = { ...syntheticCalibration(PRECISION), radiusPx: PRECISION.radiusPx * 1.4 };

    expect(hintTemplate(cv, img, cal).template).toBe('precision');
  }, 30_000);

  it('returns precision at confidence 0 when no ray lies inside the image', async () => {
    const img = await syntheticTargetRgba(PRECISION);
    const cal = { ...syntheticCalibration(PRECISION), cx: -5000, cy: -5000 };

    expect(ringPeriodicity(cv, img, cal)).toBeNull();
    expect(hintTemplate(cv, img, cal)).toEqual({ template: 'precision', confidence: 0 });
  }, 30_000);
});

describe('hintTemplate on the committed reference JPEGs (M23 Tests)', () => {
  const seeds = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../fixtures/reference/seed-calibrations.json', import.meta.url)), 'utf-8'),
  ) as Record<string, CalibrationLike | string>;

  const CASES: Array<{ key: string; template: TemplateId; anchorDiameterMm: number }> = [
    // M10 Open question 3: the old transition count tied at 4 here and called it precision.
    { key: 'IMG_5057-sighting.jpg', template: 'sighting', anchorDiameterMm: 115 },
    { key: 'IMG_5132-precision.jpg', template: 'precision', anchorDiameterMm: 112.4 },
  ];

  for (const { key, template, anchorDiameterMm } of CASES) {
    it(`${key} → ${template}, on the seed calibration and on A4's own disc`, async () => {
      const seed = seeds[key];
      if (seed === undefined || typeof seed === 'string') throw new Error(`no seed calibration for ${key}`);
      const img = await jpegFileToRgba(fileURLToPath(new URL(`../../../docs/reference/${key}`, import.meta.url)));

      const onSeed = hintTemplate(cv, img, seed);
      expect(onSeed.template).toBe(template);
      expect(onSeed.confidence).toBeGreaterThanOrEqual(0.5);

      // An import (no prior, both anchor sizes) takes its anchor diameter from the hint (M10 step 3.5).
      const detection = detectAnchor(cv, img, null, 'both');
      expect(detection).not.toBeNull();
      expect(hintTemplate(cv, img, detection!.calibration).template).toBe(template);
      expect(detection!.calibration.anchorDiameterMm).toBe(anchorDiameterMm);

      const periodicity = ringPeriodicity(cv, img, detection!.calibration)!;
      if (template === 'precision') expect(periodicity).toBeGreaterThanOrEqual(TEMPLATE_PERIODICITY_THRESHOLD);
      else expect(periodicity).toBeLessThan(TEMPLATE_PERIODICITY_THRESHOLD);
    }, 60_000);
  }
});
