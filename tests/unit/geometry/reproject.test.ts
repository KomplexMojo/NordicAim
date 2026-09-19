import { describe, expect, it } from 'vitest';

import type { Shot } from '@/lib/domain/analysis';
import type { Calibration } from '@/lib/domain/photo';
import { REPROJECT_TOLERANCE_MM, reprojectShots, samePositionMm } from '@/lib/geometry/reproject';
import { mmToPx } from '@/lib/geometry/transform';

const before: Calibration = {
  cx: 600,
  cy: 600,
  radiusPx: 230,
  axisRatio: 1,
  angleDeg: 0,
  anchorDiameterMm: 115,
  source: 'auto',
  confidence: 0.9,
  perspective: null,
};

function shot(id: string, xMm: number, yMm: number, source: Shot['source'] = 'auto'): Shot {
  return {
    id,
    xMm,
    yMm,
    multiplicity: 1,
    positionOverrides: null,
    source,
    confidence: source === 'auto' ? 0.8 : null,
    cluster: false,
    possibleOverlap: false,
  };
}

describe('geometry/reproject (REV-46)', () => {
  it('keeps every shot on the same image pixel when the alignment moves', () => {
    const after: Calibration = { ...before, cx: 612, cy: 591, radiusPx: 241, axisRatio: 0.93, angleDeg: 17 };
    const shots = [shot('a', 0, 0), shot('b', 12.5, -7.25), shot('c', -40, 31, 'manual')];
    const moved = reprojectShots(shots, before, after);
    moved.forEach((next, i) => {
      const was = mmToPx(shots[i]!, before);
      const now = mmToPx(next, after);
      expect(now.x).toBeCloseTo(was.x, 9);
      expect(now.y).toBeCloseTo(was.y, 9);
    });
  });

  it('moves the millimetre position the opposite way to the rings', () => {
    // The rings move 10 px right; a hole at the old centre is now 10 px LEFT of the new centre.
    const after: Calibration = { ...before, cx: before.cx + 10 };
    const [moved] = reprojectShots([shot('a', 0, 0)], before, after);
    const mmPerPx = before.anchorDiameterMm / 2 / before.radiusPx;
    expect(moved!.xMm).toBeCloseTo(-10 * mmPerPx, 9);
    expect(moved!.yMm).toBeCloseTo(0, 9);
  });

  it('changes nothing but the position: id, source, confidence and multiplicity survive', () => {
    const after: Calibration = { ...before, radiusPx: 250 };
    const original = { ...shot('m', 5, 5, 'manual'), multiplicity: 2, positionOverrides: [null, null] };
    const [moved] = reprojectShots([original], before, after);
    expect(moved).toMatchObject({ id: 'm', source: 'manual', confidence: null, multiplicity: 2 });
    expect(moved!.positionOverrides).toEqual([null, null]);
  });

  it('is the identity when the alignment does not change', () => {
    const shots = [shot('a', 3.3, -9.1)];
    const [same] = reprojectShots(shots, before, { ...before });
    expect(samePositionMm(same!, shots[0]!)).toBe(true);
  });

  it('drifts less than the tolerance over many small drags, so a re-aligned shot is not an edit', () => {
    // A drag delivers dozens of small alignment changes; re-projecting through each must land where one
    // direct re-projection does, within REPROJECT_TOLERANCE_MM.
    const target: Calibration = { ...before, cx: 650, cy: 560, radiusPx: 260, axisRatio: 0.9, angleDeg: 25 };
    let cal = before;
    let stepped = [shot('a', 27, -13)];
    for (let i = 1; i <= 200; i += 1) {
      const t = i / 200;
      const next: Calibration = {
        ...before,
        cx: before.cx + (target.cx - before.cx) * t,
        cy: before.cy + (target.cy - before.cy) * t,
        radiusPx: before.radiusPx + (target.radiusPx - before.radiusPx) * t,
        axisRatio: before.axisRatio + (target.axisRatio - before.axisRatio) * t,
        angleDeg: before.angleDeg + (target.angleDeg - before.angleDeg) * t,
      };
      stepped = reprojectShots(stepped, cal, next);
      cal = next;
    }
    const [direct] = reprojectShots([shot('a', 27, -13)], before, target);
    expect(samePositionMm(stepped[0]!, direct!)).toBe(true);
  });

  it('re-projects through a calibration with a perspective (REV-44)', () => {
    const tiltedBefore: Calibration = { ...before, perspective: { p: 3e-4, q: -8e-4 } };
    const after: Calibration = { ...tiltedBefore, cx: 612, cy: 591, radiusPx: 241, axisRatio: 0.93, angleDeg: 17 };
    const shots = [shot('a', 0, 0), shot('b', 12.5, -7.25), shot('c', -40, 31, 'manual')];
    const moved = reprojectShots(shots, tiltedBefore, after);
    moved.forEach((next, i) => {
      const was = mmToPx(shots[i]!, tiltedBefore);
      const now = mmToPx(next, after);
      expect(now.x).toBeCloseTo(was.x, 9);
      expect(now.y).toBeCloseTo(was.y, 9);
    });
    // Reset alignment (perspective -> null) keeps the holes where they are too.
    const reset = reprojectShots(moved, after, { ...after, perspective: null });
    reset.forEach((next, i) => {
      const was = mmToPx(shots[i]!, tiltedBefore);
      const now = mmToPx(next, { ...after, perspective: null });
      expect(now.x).toBeCloseTo(was.x, 9);
      expect(now.y).toBeCloseTo(was.y, 9);
    });
  });

  it('drifts less than the tolerance over many small drags with a perspective held fixed', () => {
    const tiltedBefore: Calibration = { ...before, perspective: { p: 3e-4, q: -8e-4 } };
    const target: Calibration = { ...tiltedBefore, cx: 650, cy: 560, radiusPx: 260, axisRatio: 0.9, angleDeg: 25 };
    let cal = tiltedBefore;
    let stepped = [shot('a', 27, -13)];
    for (let i = 1; i <= 200; i += 1) {
      const t = i / 200;
      const next: Calibration = {
        ...tiltedBefore,
        cx: tiltedBefore.cx + (target.cx - tiltedBefore.cx) * t,
        cy: tiltedBefore.cy + (target.cy - tiltedBefore.cy) * t,
        radiusPx: tiltedBefore.radiusPx + (target.radiusPx - tiltedBefore.radiusPx) * t,
        axisRatio: tiltedBefore.axisRatio + (target.axisRatio - tiltedBefore.axisRatio) * t,
        angleDeg: tiltedBefore.angleDeg + (target.angleDeg - tiltedBefore.angleDeg) * t,
      };
      stepped = reprojectShots(stepped, cal, next);
      cal = next;
    }
    const [direct] = reprojectShots([shot('a', 27, -13)], tiltedBefore, target);
    expect(samePositionMm(stepped[0]!, direct!)).toBe(true);
  });

  it('treats a real drag as a different position', () => {
    expect(samePositionMm({ xMm: 1, yMm: 1 }, { xMm: 1 + 10 * REPROJECT_TOLERANCE_MM, yMm: 1 })).toBe(false);
    expect(samePositionMm({ xMm: 1, yMm: 1 }, { xMm: 1.01, yMm: 1 })).toBe(false);
  });
});
