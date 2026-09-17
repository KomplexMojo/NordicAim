import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { detectAnchor } from '@/lib/cv/anchor';
import { SHEET_FALLBACK_RADIUS_MM, SHEET_SEARCH_CAP_MM, STROKE_MIN_FRACTION } from '@/lib/cv/constants';
import { detectShotCandidates, detectShots, isPrintedGlyph, printedCircleRadiiMm } from '@/lib/cv/holes';
import { inNumeralBox, numeralCentresMm } from '@/lib/cv/print-mask';
import type { OpenCv } from '@/lib/cv/opencv';
import { mmToRectified, outerRadiusMm, rectifiedSidePx, rectifiedToMm } from '@/lib/cv/rectify';
import type { Calibration } from '@/lib/domain/photo';

import { loadOpenCvForTests } from '../../helpers/opencv';
import { jpegFileToRgba } from '../../helpers/rgba';
import { matchShots } from '../../helpers/shot-match';
import {
  BACKING_BOARD_HOLES,
  FAR_PAPER_HOLES,
  LETTER_SHEET_MM,
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

async function detect(spec: SyntheticTargetSpec, holesMm: SyntheticHole[], over: Partial<SyntheticTargetSpec> = {}) {
  const img = await syntheticTargetRgba({ ...spec, ...over, holesMm });
  return detectShots(cv, img, syntheticCalibration(spec), spec.template, SYNTHETIC_HOLE_DIAMETER_MM);
}

async function report(spec: SyntheticTargetSpec, holesMm: SyntheticHole[], over: Partial<SyntheticTargetSpec> = {}) {
  const img = await syntheticTargetRgba({ ...spec, ...over, holesMm });
  return detectShotCandidates(cv, img, syntheticCalibration(spec), spec.template, SYNTHETIC_HOLE_DIAMETER_MM);
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

    // Separate holes, so every one of them is a single shot, and none is flagged as a cluster.
    // M11's confidence floor still holds: confidence is now the R1 score, the deviating share of the hole disc.
    for (const shot of shots) {
      expect(shot.multiplicity).toBe(1);
      expect(shot.cluster).toBe(false);
      expect(shot.source).toBe('auto');
      expect(shot.positionOverrides).toBeNull();
      expect(shot.confidence).not.toBeNull();
      expect(shot.confidence!).toBeGreaterThan(0.65);
      expect(shot.confidence!).toBeLessThanOrEqual(1);
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

  it('finds every hole on a tilted sheet (M16 Tests: tilt and curl)', async () => {
    // A sheet photographed at an angle: rotated 30 degrees in frame and foreshortened to an axis
    // ratio of 0.82, which is a stronger tilt than either reference photo (0.90 and 0.94).
    const tilted: SyntheticTargetSpec = { ...PRECISION, angleDeg: 30, axisRatio: 0.82 };
    const shots = await detect(tilted, PRECISION_TEST_HOLES);
    const result = matchShots(shots, PRECISION_TEST_HOLES);

    expect(shots).toHaveLength(PRECISION_TEST_HOLES.length);
    expect(result.matched).toBe(PRECISION_TEST_HOLES.length);
    expect(result.recall).toBeGreaterThanOrEqual(0.95);
    expect(result.precision).toBeGreaterThanOrEqual(0.95);
    // Measured: 0.34 mm, against 0.33 mm on the same holes with the sheet square to the camera.
    expect(result.meanErrorMm!).toBeLessThanOrEqual(0.8);
    for (const shot of shots) expect(shot.multiplicity).toBe(1);
  }, 120_000);

  it('finds nothing on an unshot sheet (the printed rings are erased, step 4)', async () => {
    expect(await detect(PRECISION, [])).toEqual([]);
    expect(await detect(SIGHTING, [])).toEqual([]);
  }, 120_000);

  it('never detects the sighting sheet dashed guides (white dashes on black, 20 and 55 mm)', async () => {
    // The dashes look exactly like a hole inside the disc: bright blobs on a dark ground.
    const holes = [polarHole(12, 40), polarHole(35, 215)];
    const shots = await detect(SIGHTING, holes);

    for (const shot of shots) {
      const radial = Math.hypot(shot.xMm, shot.yMm);
      expect(Math.abs(radial - 55)).toBeGreaterThan(2);
      expect(Math.abs(radial - 20)).toBeGreaterThan(2);
    }
    expect(matchShots(shots, holes).matched).toBe(2);
  }, 120_000);
});

describe('REV-28: one hole to start', () => {
  it('never turns two holes overlapping at 3 mm into a multiplicity: every shot is ONE hole', async () => {
    const shots = await detect(SIGHTING, SIGHTING_TEST_HOLES);

    for (const shot of shots) expect(shot.multiplicity).toBe(1);
    // The two separate holes are found...
    expect(matchShots(shots, SIGHTING_TEST_HOLES.slice(2)).matched).toBe(2);
    // ...the overlapping pair is reported at most as the two holes it is, never as an invented extra...
    const nearPair = shots.filter((shot) => Math.hypot(shot.xMm - 13.3, shot.yMm - 33.75) <= 4.5);
    expect(nearPair.length).toBeGreaterThanOrEqual(1);
    expect(nearPair.length).toBeLessThanOrEqual(2);
    // ...so the app never reports more units than the four holes fired (REV-29 parks the rest).
    expect(shots.reduce((sum, shot) => sum + shot.multiplicity, 0)).toBeLessThanOrEqual(SIGHTING_TEST_HOLES.length);
  }, 120_000);

  it('gives every auto shot multiplicity 1, however large the blob', async () => {
    const shots = await detect(PRECISION, [...PRECISION_TEST_HOLES, { xMm: 8, yMm: -46, diameterMm: 12 }]);
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) expect(shot.multiplicity).toBe(1);
  }, 120_000);
});

describe('R1 (REV-34): polarity-free candidates', () => {
  it('finds dark-core, bright-core and equal-core holes on the black and dark holes on the paper', async () => {
    const holes: SyntheticHole[] = [
      { ...polarHole(17.2, 140), style: 'dark' },
      { ...polarHole(33.2, 20), style: 'bright' },
      { ...polarHole(41.2, 250), style: 'rim' },
      { ...polarHole(25.2, 320), style: 'tan' },
      { ...polarHole(65.2, 170), style: 'paperDark' },
      { ...polarHole(73.2, 300), style: 'paperDark' },
    ];
    const shots = await detect(PRECISION, holes);
    const result = matchShots(shots, holes);

    expect(result.matched).toBe(holes.length);
    expect(shots).toHaveLength(holes.length);
    expect(result.meanErrorMm!).toBeLessThanOrEqual(0.8);
  }, 120_000);

  it('finds every hole under a lighting gradient across the sheet', async () => {
    const shots = await detect(PRECISION, PRECISION_TEST_HOLES, { shadowOpacity: 0.55 });
    expect(matchShots(shots, PRECISION_TEST_HOLES).matched).toBe(PRECISION_TEST_HOLES.length);
  }, 120_000);

  it('returns each hole exactly once', async () => {
    const hole = { xMm: 32.8125, yMm: -2.8125 };
    const shots = await detect(PRECISION, [hole]);
    expect(shots).toHaveLength(1);
    expect(Math.hypot(shots[0]!.xMm - hole.xMm, shots[0]!.yMm - hole.yMm)).toBeLessThanOrEqual(1);
  }, 120_000);

  it('never manufactures candidates to fill the declared rounds', async () => {
    // Six holes on a sheet the owner fired ten rounds at: six shots, and the rest stay missing.
    const six = PRECISION_TEST_HOLES.slice(0, 6);
    const shots = await detect(PRECISION, six);

    expect(shots).toHaveLength(6);
    expect(matchShots(shots, six).matched).toBe(6);
  }, 120_000);
});

describe('R2 (REV-35): printed marks are removed by position', () => {
  it('prints the numerals at their band centres', () => {
    // Ring n+1 to ring n; the "3" sits between the aiming mark's edge (56.2) and ring 3 (61.2).
    expect(numeralCentresMm()).toEqual([17.2, 25.2, 33.2, 41.2, 49.2, 58.7, 65.2, 73.2]);
  });

  it('boxes a numeral on any of the four axes, and nothing between them', () => {
    expect(inNumeralBox(0, 17.2, 0)).toBe(true);
    expect(inNumeralBox(-49.2, 1.5, 0)).toBe(true);
    expect(inNumeralBox(0, -73.2, 0)).toBe(true);
    expect(inNumeralBox(17.2 * Math.cos(0.3), 17.2 * Math.sin(0.3), 17.2)).toBe(true);
    // Between the axes, between the bands, and past the tangential half-width.
    expect(inNumeralBox(12, 12, 0)).toBe(false);
    expect(inNumeralBox(0, 21.2, 0)).toBe(false);
    expect(inNumeralBox(3, 33.2, 0)).toBe(false);
  });

  for (const deg of [0, 17, 45]) {
    it(`estimates a precision sheet's numeral rotation at ${deg} degrees within 2, and detects no numeral`, async () => {
      const holes = [polarHole(21.2 + 4, deg + 45), polarHole(37.2 + 4, deg + 135), polarHole(65.2, deg + 225)];
      const found = await report(PRECISION, holes, { numeralsDeg: deg });

      const rotation = found.numeralRotation!;
      expect(rotation.reliable).toBe(true);
      // Modulo 90: 45 and -45 are the same four axes.
      const error = Math.abs(((((rotation.deg - deg) % 90) + 135) % 90) - 45);
      expect(error).toBeLessThanOrEqual(2);

      for (const candidate of found.candidates) {
        for (const radial of numeralCentresMm()) {
          for (let axis = 0; axis < 4; axis += 1) {
            const theta = ((deg + 90 * axis) * Math.PI) / 180;
            const d = Math.hypot(candidate.xMm - radial * Math.cos(theta), candidate.yMm - radial * Math.sin(theta));
            expect(d).toBeGreaterThan(2.5);
          }
        }
      }
      expect(matchShots(found.candidates, holes).matched).toBe(holes.length);
    }, 120_000);
  }
});

describe('R3 (REV-36): search the paper sheet', () => {
  it('finds holes on the paper beyond the old bound and none in the backing board beside the sheet', async () => {
    const holes = [...PRECISION_TEST_HOLES, ...FAR_PAPER_HOLES, ...BACKING_BOARD_HOLES];
    const found = await report(PRECISION, holes, { sheetMm: LETTER_SHEET_MM });

    expect(found.sheet.method).toBe('segmented');
    expect(matchShots(found.candidates, FAR_PAPER_HOLES).matched).toBe(FAR_PAPER_HOLES.length);
    expect(matchShots(found.candidates, BACKING_BOARD_HOLES).matched).toBe(0);
    expect(matchShots(found.candidates, [...PRECISION_TEST_HOLES, ...FAR_PAPER_HOLES]).matched).toBe(
      PRECISION_TEST_HOLES.length + FAR_PAPER_HOLES.length,
    );
    for (const candidate of found.candidates) {
      expect(candidate.xMm).toBeGreaterThan(LETTER_SHEET_MM.left);
      expect(candidate.xMm).toBeLessThan(LETTER_SHEET_MM.right);
      expect(candidate.yMm).toBeGreaterThan(LETTER_SHEET_MM.bottom);
      expect(candidate.radialMm).toBeLessThanOrEqual(SHEET_SEARCH_CAP_MM);
    }
  }, 120_000);

  it('falls back to the 105 mm circle, and records it, when no paper surrounds the target', async () => {
    const holes = [polarHole(33.2, 20), { xMm: 0, yMm: 125, style: 'paperDark' as const }];
    const found = await report(PRECISION, holes, { noPaper: true });

    expect(found.sheet.method).toBe('fallback');
    expect(found.sheet.paperGray).toBeLessThan(100);
    for (const candidate of found.candidates) expect(candidate.radialMm).toBeLessThanOrEqual(SHEET_FALLBACK_RADIUS_MM);
    expect(matchShots(found.candidates, [holes[1]!]).matched).toBe(0);
  }, 120_000);
});

describe('REV-27: printed glyphs are rejected by shape (kept by measurement, M16 R2)', () => {
  it('rejects a thin stroke and keeps a compact blob', () => {
    // The values measured on IMG_5132-precision.jpg (M16 Completion notes): a numeral's inscribed
    // radius peaks at 0.92 mm, a real hole's bottoms out at 1.04 mm, against a 0.98 mm threshold.
    const pxPerMm = 8;
    const glyph = { elongation: 1.08, strokeRadiusPx: 0.92 * pxPerMm };
    const hole = { elongation: 1.78, strokeRadiusPx: 1.04 * pxPerMm };

    expect(STROKE_MIN_FRACTION * (5.6 / 2)).toBeCloseTo(0.98, 2);
    expect(isPrintedGlyph(glyph, 5.6, pxPerMm)).toBe(true);
    expect(isPrintedGlyph(hole, 5.6, pxPerMm)).toBe(false);
    // The elongation half of the filter: a long thin ring-line remnant goes too.
    expect(isPrintedGlyph({ elongation: 5.4, strokeRadiusPx: 2 * pxPerMm }, 5.6, pxPerMm)).toBe(true);
  });

  it('detects no ring numeral on the real precision sheet, and at most the 10 rounds fired', async () => {
    const path = fileURLToPath(new URL('../../../docs/reference/IMG_5132-precision.jpg', import.meta.url));
    const img = await jpegFileToRgba(path);
    // A4 measures the aiming mark; A5 detects against what it measured, as the pipeline does.
    const detection = detectAnchor(cv, img, null, 'both');
    expect(detection).not.toBeNull();
    const calibration: Calibration = detection!.calibration;

    const shots = detectShots(cv, img, calibration, 'precision', SYNTHETIC_HOLE_DIAMETER_MM);

    // The sheet is a 10-round test and M11 reported 19 detections / 62 units on it.
    expect(shots.length).toBeLessThanOrEqual(10);
    for (const shot of shots) expect(shot.multiplicity).toBe(1);

    // The printed ring numerals at 12 and 6 o'clock sit on the vertical axis; the owner's group is
    // in the lower-left quadrant, so nothing in that column is a hole on this photo. (The 3 and 9
    // o'clock row shares a band with a real hole at about (-23, 0) mm, so only the column is pinned.)
    const onNumeralColumn = shots.filter(
      (shot) => Math.abs(shot.xMm) <= 3 && Math.hypot(shot.xMm, shot.yMm) >= 6,
    );
    expect(onNumeralColumn).toEqual([]);
  }, 120_000);
});

describe('fixtures', () => {
  it('reads the reference JPEG the glyph test uses', () => {
    const path = fileURLToPath(new URL('../../../docs/reference/IMG_5132-precision.jpg', import.meta.url));
    expect(readFileSync(path).byteLength).toBeGreaterThan(0);
  });
});
