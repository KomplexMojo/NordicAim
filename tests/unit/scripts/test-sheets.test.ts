import { beforeAll, describe, expect, it } from 'vitest';

import type { OpenCv } from '@/lib/cv/opencv';
import { renderPatternViewMark } from '@/lib/render/diagram-marks';

import { loadOpenCvForTests } from '../../helpers/opencv';
// @ts-expect-error: a Node-only .mjs script without type declarations.
import * as sheets from '../../../scripts/make-test-sheets.mjs';

// Issue #65 / #67 (REV-135): the printable sheets' AprilTag corner markers and layout.

interface Kind {
  id: 'sight-in' | 'confirm' | 'precision-prone' | 'precision-standing';
  label: string;
  code: number;
  template: string;
}
const { CLAMP, KIND_MARK, KINDS, MARK, PAGE, kindMark, markerCells, markerId, markerOrigin } = sheets as {
  CLAMP: { halfWidth: number; depth: number };
  KIND_MARK: { size: number; top: number; gap: number; label: number };
  kindMark(kind: Kind): string;
  KINDS: Kind[];
  MARK: { size: number; cells: number; dx: number; dy: number; quiet: number };
  PAGE: { w: number; h: number };
  markerCells(cv: OpenCv, id: number): number[][];
  markerId(kind: number, corner: number, version?: number): number;
  markerOrigin(corner: number): { x: number; y: number };
};

let cv: OpenCv;
beforeAll(async () => {
  cv = await loadOpenCvForTests();
}, 60_000);

/** Draws the marker at 10 px per cell on a white page with a 2-cell quiet zone, then detects it. */
function detect(cells: number[][]): number[] {
  const px = 10;
  const side = (cells.length + 4) * px;
  const img = new cv.Mat(side, side, cv.CV_8UC1, new cv.Scalar(255));
  cells.forEach((row, r) =>
    row.forEach((b, c) => {
      if (b === 1) cv.rectangle(img, new cv.Point((c + 2) * px, (r + 2) * px), new cv.Point((c + 3) * px - 1, (r + 3) * px - 1), new cv.Scalar(0), -1);
    }),
  );
  const det = new cv.aruco_ArucoDetector(
    cv.getPredefinedDictionary(cv.DICT_APRILTAG_36h11),
    new cv.aruco_DetectorParameters(),
    new cv.aruco_RefineParameters(10, 3, true),
  );
  const corners = new cv.MatVector();
  const ids = new cv.Mat();
  const rejected = new cv.MatVector();
  det.detectMarkers(img, corners, ids, rejected);
  const out = Array.from(ids.data32S as Int32Array);
  [img, ids].forEach((m) => m.delete());
  [corners, rejected].forEach((v) => v.delete());
  return out;
}

describe('sheet marker ids', () => {
  it('encode version << 4 | kind << 2 | corner, unique across every page', () => {
    expect(markerId(0, 0, 1)).toBe(16);
    expect(markerId(3, 3, 1)).toBe(31);
    const ids = KINDS.flatMap((k) => [0, 1, 2, 3].map((corner) => markerId(k.code, corner)));
    expect(new Set(ids).size).toBe(16);
  });

  it('draws markers that the bundled OpenCV reads back with the same id', () => {
    for (const id of [16, 21, 26, 31]) {
      const cells = markerCells(cv, id);
      expect(cells).toHaveLength(MARK.cells);
      // The 1-cell border is solid black.
      expect(cells[0]).toEqual(Array(MARK.cells).fill(1));
      expect(detect(cells)).toEqual([id]);
    }
  });
});

describe('sheet layout', () => {
  it('places the markers 170 × 210 mm apart, clear of the 154.4 mm precision target', () => {
    expect([2 * MARK.dx, 2 * MARK.dy]).toEqual([170, 210]);
    // The nearest point of a marker's quiet zone is well outside the outermost printed ring (77.2 mm).
    const nearest = Math.hypot(MARK.dx - MARK.size / 2 - MARK.quiet, MARK.dy - MARK.size / 2 - MARK.quiet);
    expect(nearest).toBeGreaterThan(154.4 / 2 + 30);
  });

  it('keeps every marker and its quiet zone on the page and out of the clipboard clamp at the top centre', () => {
    for (const corner of [0, 1, 2, 3]) {
      const { x, y } = markerOrigin(corner);
      expect(x - MARK.quiet).toBeGreaterThan(6);
      expect(y - MARK.quiet).toBeGreaterThan(6);
      expect(x + MARK.size + MARK.quiet).toBeLessThan(PAGE.w - 6);
      expect(y + MARK.size + MARK.quiet).toBeLessThan(PAGE.h - 6);
      if (corner < 2) {
        const left = x;
        const right = x + MARK.size;
        const clampLeft = PAGE.w / 2 - CLAMP.halfWidth;
        const clampRight = PAGE.w / 2 + CLAMP.halfWidth;
        expect(right < clampLeft || left > clampRight).toBe(true);
      }
    }
  });
});

describe('sheet kind mark (REV-138)', () => {
  it("is the app's own mark for each kind, with the kind's name", () => {
    for (const kind of KINDS) {
      const svg = kindMark(kind);
      expect(svg).toContain(renderPatternViewMark(kind.id));
      expect(svg).toContain(`>${kind.label}</text>`);
    }
  });

  it('sits in the clamp zone at the top centre, inside the printable margin and clear of the top markers', () => {
    expect(KIND_MARK.top).toBeGreaterThanOrEqual(4);
    expect(KIND_MARK.top + KIND_MARK.size).toBeLessThanOrEqual(CLAMP.depth);
    // Between the top markers: the top-left marker's quiet zone ends this far left of the page centre.
    const clearHalfWidth = PAGE.w / 2 - (markerOrigin(0).x + MARK.size + MARK.quiet);
    for (const kind of KINDS) {
      // The same width estimate kindMark centres by; the longest name must fit the zone.
      const width = KIND_MARK.size + KIND_MARK.gap + kind.label.length * KIND_MARK.label * 0.58;
      expect(width / 2).toBeLessThan(Math.min(CLAMP.halfWidth, clearHalfWidth));
    }
  });
});
