// M16 R4 (REV-37): the matcher and pooling `pnpm cv:eval` gates detection on. Pure; the owner's labels
// themselves are private and never read here.

import { describe, expect, it } from 'vitest';

import {
  GATE_PRECISION_MIN,
  GATE_RECALL_MIN,
  matchLabelled,
  matchTolerancePx,
  parseLabelledHoles,
  passesGate,
  pooled,
} from '../../helpers/labelled-holes';

const CALIBRATION = { cx: 450, cy: 600, radiusPx: 200, axisRatio: 1, angleDeg: 0, anchorDiameterMm: 112.4 };

describe('matchTolerancePx (R4)', () => {
  it('is 0.8 hole diameters in working px', () => {
    // 200 px over a 56.2 mm radius is 3.5587 px/mm; 0.8 x 5.6 mm x that = 15.943 px.
    expect(matchTolerancePx(CALIBRATION, 5.6)).toBeCloseTo((0.8 * 5.6 * 200) / 56.2, 9);
  });
});

describe('matchLabelled (R4)', () => {
  it('matches greedily, closest pairs first, each side at most once', () => {
    const holes = [
      { x: 100, y: 100 },
      { x: 120, y: 100 },
      { x: 300, y: 300 },
      { x: 500, y: 500 },
    ];
    const detections = [
      { x: 110, y: 100 }, // 10 px from both of the first two holes
      { x: 121, y: 100 }, // 1 px from the second: this pair goes first
      { x: 302, y: 301 },
      { x: 700, y: 700 }, // nothing near: a false positive
      { x: 301, y: 300 }, // the closer of the two near hole 3, so it takes it
    ];
    const m = matchLabelled(detections, holes, 12);

    expect(m.truePositives).toBe(3);
    expect(m.falsePositives).toBe(2);
    expect(m.falseNegatives).toBe(1);
    expect(m.recall).toBeCloseTo(0.75, 12);
    expect(m.precision).toBeCloseTo(0.6, 12);
    // The detection at (302, 301) lost hole 3 to the closer one; (700, 700) matched nothing.
    expect(m.unmatchedDetections).toEqual([2, 3]);
  });

  it('never matches beyond the tolerance', () => {
    const m = matchLabelled([{ x: 0, y: 0 }], [{ x: 12.01, y: 0 }], 12);
    expect(m.truePositives).toBe(0);
    expect(m.recall).toBe(0);
    expect(m.precision).toBe(0);
  });
});

describe('the gated set (R4)', () => {
  const file = JSON.stringify({
    entries: {
      A: { name: 'A.jpeg', target: 'no-target', comment: 'no target' },
      B: {
        name: 'B.jpeg',
        template: 'precision',
        workingSize: [900, 1200],
        calibrationUsed: CALIBRATION,
        holes: [{ xPx: 1, yPx: 2, xMm: 0, yMm: 0, source: 'owner-marked-missed' }],
        caveat: null,
      },
      C: {
        name: 'C.jpeg',
        template: 'sighting',
        workingSize: [900, 1200],
        calibrationUsed: { ...CALIBRATION, anchorDiameterMm: 115 },
        holes: [],
        caveat: 'owner read rank numbers as shot counts',
      },
    },
  });

  it('parses photos with a target, keeps caveats, and lists the rest', () => {
    const set = parseLabelledHoles(file);
    expect(set.photos.map((p) => p.id)).toEqual(['B', 'C']);
    expect(set.withoutTarget).toEqual(['A']);
    expect(set.photos.find((p) => p.id === 'C')?.caveat).toBe('owner read rank numbers as shot counts');
  });

  it('excludes caveated photos from the gate and pools the rest', () => {
    const set = parseLabelledHoles(file);
    const results = new Map([
      ['B', { truePositives: 9, falsePositives: 1, falseNegatives: 1 }],
      // A caveated photo's terrible numbers must not move the gate.
      ['C', { truePositives: 0, falsePositives: 20, falseNegatives: 20 }],
    ]);
    const gated = set.photos.filter((p) => p.caveat === null).map((p) => results.get(p.id)!);
    const result = pooled(gated);

    expect(result.recall).toBeCloseTo(0.9, 12);
    expect(result.precision).toBeCloseTo(0.9, 12);
    expect(passesGate(result)).toBe(true);
    expect(passesGate(pooled([...results.values()]))).toBe(false);
  });

  it('pools counts rather than averaging ratios, and gates at the provisional floors', () => {
    const result = pooled([
      { truePositives: 1, falsePositives: 0, falseNegatives: 0 },
      { truePositives: 5, falsePositives: 5, falseNegatives: 5 },
    ]);
    expect(result.recall).toBeCloseTo(6 / 11, 12);
    expect(result.precision).toBeCloseTo(6 / 11, 12);
    expect(GATE_RECALL_MIN).toBe(0.85);
    expect(GATE_PRECISION_MIN).toBe(0.85);
    expect(passesGate({ recall: 0.85, precision: 0.849 })).toBe(false);
  });
});
