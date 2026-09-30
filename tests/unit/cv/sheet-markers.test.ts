import { beforeAll, describe, expect, it } from 'vitest';

import type { OpenCv } from '@/lib/cv/opencv';
import { decodeMarkerId, detectSheetMarkers, markerCornersMm, markersKind, SHEET_MARKER } from '@/lib/cv/sheet-markers';
import type { RgbaImage } from '@/lib/media/format';

import { loadOpenCvForTests } from '../../helpers/opencv';
// @ts-expect-error: a Node-only .mjs script without type declarations.
import * as sheets from '../../../scripts/make-test-sheets.mjs';

// Issue #65 (REV-144): reading the printed sheets' corner markers.

const { KINDS, MARK, PAGE, markerCells, markerId, markerOrigin } = sheets as {
  KINDS: Array<{ id: string; code: number }>;
  MARK: { size: number; cells: number; dx: number; dy: number };
  PAGE: { w: number; h: number };
  markerCells(cv: OpenCv, id: number): number[][];
  markerId(kind: number, corner: number): number;
  markerOrigin(corner: number): { x: number; y: number };
};

let cv: OpenCv;
beforeAll(async () => {
  cv = await loadOpenCvForTests();
}, 60_000);

/** A white page at `pxPerMm` with the four markers of `kindCode` drawn where the sheet prints them. */
function page(kindCode: number, pxPerMm: number, corners: number[] = [0, 1, 2, 3]): RgbaImage {
  const width = Math.round(PAGE.w * pxPerMm);
  const height = Math.round(PAGE.h * pxPerMm);
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const cell = (MARK.size / MARK.cells) * pxPerMm;
  for (const corner of corners) {
    const { x, y } = markerOrigin(corner);
    markerCells(cv, markerId(kindCode, corner)).forEach((row, r) =>
      row.forEach((b, c) => {
        if (b !== 1) return;
        for (let py = Math.round(y * pxPerMm + r * cell); py < Math.round(y * pxPerMm + (r + 1) * cell); py += 1) {
          for (let px = Math.round(x * pxPerMm + c * cell); px < Math.round(x * pxPerMm + (c + 1) * cell); px += 1) {
            const i = (py * width + px) * 4;
            data[i] = data[i + 1] = data[i + 2] = 0;
          }
        }
      }),
    );
  }
  return { data, width, height };
}

describe('the marker layout matches the printed sheets', () => {
  it('uses the script’s size, spacing and version', () => {
    expect(SHEET_MARKER).toMatchObject({ sizeMm: MARK.size, dxMm: MARK.dx, dyMm: MARK.dy });
    expect(markerId(0, 0)).toBe(SHEET_MARKER.version << 4);
  });

  it('decodes every printed id to its kind and corner, and nothing else', () => {
    for (const kind of KINDS) {
      for (const corner of [0, 1, 2, 3] as const) {
        expect(decodeMarkerId(markerId(kind.code, corner))).toEqual({ kind: kind.id, corner });
      }
    }
    expect(decodeMarkerId(0)).toBeNull();
    expect(decodeMarkerId(15)).toBeNull();
    expect(decodeMarkerId(32)).toBeNull();
  });

  it('puts each marker’s corners where the sheet prints them (target mm, +y up; page mm, +y down)', () => {
    for (const corner of [0, 1, 2, 3] as const) {
      const { x, y } = markerOrigin(corner);
      const [tl, tr, br, bl] = markerCornersMm(corner).map((p) => ({ x: PAGE.w / 2 + p.xMm, y: PAGE.h / 2 - p.yMm }));
      expect(tl!.x).toBeCloseTo(x, 9);
      expect(tl!.y).toBeCloseTo(y, 9);
      expect(tr!.x).toBeCloseTo(x + MARK.size, 9);
      expect(br!.y).toBeCloseTo(y + MARK.size, 9);
      expect(bl!.x).toBeCloseTo(x, 9);
    }
  });

  it('agrees on a kind only when every marker names the same one', () => {
    expect(markersKind([{ kind: 'confirm' }, { kind: 'confirm' }])).toBe('confirm');
    expect(markersKind([{ kind: 'confirm' }, { kind: 'sight-in' }])).toBeNull();
    expect(markersKind([])).toBeNull();
  });
});

describe('detectSheetMarkers', () => {
  it('reads all four markers of a sheet with their kind and image-px corners', () => {
    const pxPerMm = 4;
    const found = detectSheetMarkers(cv, page(3, pxPerMm));
    expect(found.kind).toBe('precision-standing');
    expect(found.markers.map((m) => m.corner).sort()).toEqual([0, 1, 2, 3]);
    for (const m of found.markers) {
      markerCornersMm(m.corner).forEach((p, i) => {
        expect(m.corners[i]!.x).toBeCloseTo((PAGE.w / 2 + p.xMm) * pxPerMm, -0.5);
        expect(m.corners[i]!.y).toBeCloseTo((PAGE.h / 2 - p.yMm) * pxPerMm, -0.5);
      });
    }
  });

  it('scales corners back to the full image when it reads a smaller copy', () => {
    const pxPerMm = 7;
    const found = detectSheetMarkers(cv, page(0, pxPerMm, [0, 3]));
    expect(found.kind).toBe('sight-in');
    const tl = found.markers.find((m) => m.corner === 0)!;
    expect(tl.corners[0]!.x).toBeCloseTo(markerOrigin(0).x * pxPerMm, -0.7);
    expect(tl.corners[0]!.y).toBeCloseTo(markerOrigin(0).y * pxPerMm, -0.7);
  });

  it('finds nothing on a page without markers', () => {
    expect(detectSheetMarkers(cv, page(0, 3, []))).toEqual({ markers: [], kind: null });
  });
});
