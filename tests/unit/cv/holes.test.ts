import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { detectAnchor } from '@/lib/cv/anchor';
import { REGION_REFINE_MAX, STROKE_MIN_FRACTION } from '@/lib/cv/constants';
import {
  detectShotCandidates,
  detectShots,
  isPrintedGlyph,
  printedCircleRadiiMm,
  searchRadiusMm,
} from '@/lib/cv/holes';
import type { OpenCv } from '@/lib/cv/opencv';
import { mmToRectified, outerRadiusMm, rectifiedSidePx, rectifiedToMm } from '@/lib/cv/rectify';
import type { Calibration } from '@/lib/domain/photo';

import { loadOpenCvForTests } from '../../helpers/opencv';
import { jpegFileToRgba } from '../../helpers/rgba';
import { matchShots } from '../../helpers/shot-match';
import {
  BACKING_BOARD_HOLES,
  PRECISION_TEST_HOLES,
  SIGHTING_TEST_HOLES,
  SYNTHETIC_HOLE_DIAMETER_MM,
  TILE_BOUNDARY_HOLE,
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

async function report(
  spec: SyntheticTargetSpec,
  holesMm: SyntheticHole[],
  method: 'global' | 'region',
  over: Partial<SyntheticTargetSpec> = {},
) {
  const img = await syntheticTargetRgba({ ...spec, ...over, holesMm });
  return detectShotCandidates(cv, img, syntheticCalibration(spec), spec.template, SYNTHETIC_HOLE_DIAMETER_MM, {
    method,
  });
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
    // M11's confidence floor, re-measured under the region scan (M16): 0.790-0.884 on these eight.
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
  it('reads two holes overlapping at 3 mm as ONE shot of multiplicity 1', async () => {
    const shots = await detect(SIGHTING, SIGHTING_TEST_HOLES);

    // One merged blob plus the two separate holes.
    expect(shots).toHaveLength(3);
    for (const shot of shots) expect(shot.multiplicity).toBe(1);

    // The merged pair is reported once, between the two holes it came from.
    const midpoint = { xMm: 13.3, yMm: 33.75 };
    const merged = shots.find((shot) => Math.hypot(shot.xMm - midpoint.xMm, shot.yMm - midpoint.yMm) <= 3);
    expect(merged).toBeDefined();
    expect(matchShots(shots.filter((shot) => shot !== merged), SIGHTING_TEST_HOLES.slice(2)).matched).toBe(2);

    // The app never invents rounds: 4 holes fired, 3 units reported, the 4th stays missing and
    // becomes a parked marker for the owner (REV-29).
    expect(shots.reduce((sum, shot) => sum + shot.multiplicity, 0)).toBe(3);
  }, 120_000);

  it('gives every auto shot multiplicity 1, however large the blob', async () => {
    const shots = await detect(PRECISION, [...PRECISION_TEST_HOLES, { xMm: 8, yMm: -46, diameterMm: 12 }]);
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) expect(shot.multiplicity).toBe(1);
  }, 120_000);
});

describe('REV-33: never search outside the target crop', () => {
  it('ignores holes in the backing board beside the sheet', async () => {
    const shots = await detect(PRECISION, [...PRECISION_TEST_HOLES, ...BACKING_BOARD_HOLES]);

    expect(shots).toHaveLength(PRECISION_TEST_HOLES.length);
    for (const shot of shots) {
      expect(Math.hypot(shot.xMm, shot.yMm)).toBeLessThanOrEqual(searchRadiusMm('precision'));
    }
    expect(matchShots(shots, BACKING_BOARD_HOLES).matched).toBe(0);
  }, 120_000);
});

describe('REV-32: the region scan', () => {
  it('finds every hole under a lighting gradient that defeats the global thresholds', async () => {
    const shadow = { shadowOpacity: 0.55 };
    const region = await report(PRECISION, PRECISION_TEST_HOLES, 'region', shadow);
    const global = await report(PRECISION, PRECISION_TEST_HOLES, 'global', shadow);

    expect(matchShots(region.candidates, PRECISION_TEST_HOLES).matched).toBe(PRECISION_TEST_HOLES.length);
    expect(matchShots(global.candidates, PRECISION_TEST_HOLES).matched).toBeLessThan(PRECISION_TEST_HOLES.length);
  }, 120_000);

  it('returns a hole that straddles a tile boundary exactly once', async () => {
    const shots = await detect(PRECISION, [TILE_BOUNDARY_HOLE]);

    expect(shots).toHaveLength(1);
    expect(Math.hypot(shots[0]!.xMm - TILE_BOUNDARY_HOLE.xMm, shots[0]!.yMm - TILE_BOUNDARY_HOLE.yMm)).toBeLessThanOrEqual(1);
  }, 120_000);

  it('skips empty tiles: only the tiles with a candidate are refined', async () => {
    const scan = await report(PRECISION, PRECISION_TEST_HOLES, 'region');
    const tiles = scan.tiles!;

    expect(tiles.scanned).toBeGreaterThan(100);
    // Most of a sheet is blank, so almost every tile is dropped after its first pass.
    expect(tiles.withCandidates).toBeLessThan(tiles.scanned / 4);
    expect(tiles.refined).toBe(tiles.withCandidates * REGION_REFINE_MAX);
  }, 120_000);

  it('never manufactures candidates to fill the declared rounds', async () => {
    // Six holes on a sheet the owner fired ten rounds at: six shots, and the rest stay missing.
    const six = PRECISION_TEST_HOLES.slice(0, 6);
    const shots = await detect(PRECISION, six);

    expect(shots).toHaveLength(6);
    expect(matchShots(shots, six).matched).toBe(6);
  }, 120_000);
});

describe('REV-27: printed glyphs are rejected by shape', () => {
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
    // in the lower-left quadrant, so nothing in that column is a hole on this photo.
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
