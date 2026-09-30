// Issue #65 (REV-144): the corner markers of NordicAim's own printed sheets (template-reference.md §10). Pure over RgbaImage.
//
// Each of the four AprilTag 36h11 markers says which sheet it is on: id = version << 4 | kind << 2 | corner. They are used for two
// things only (owner, 2026-09-30, after measuring real photos): to name the target's kind, and to catch a gross alignment error.
// They are not an alignment: on a hand-held sheet that bows on its clipboard, a fit through corners 135 mm out was 1–1.4 mm off
// at the disc edge where the app's own ring fit was 0.2–0.4 mm.

import type { TargetKind } from '@/lib/domain/target-kind';
import type { RgbaImage } from '@/lib/media/format';

import { toGrayMat } from './gray';
import type { OpenCv } from './opencv';

/** template-reference.md §10: the layout `scripts/make-test-sheets.mjs` prints (a unit test keeps the two in step). */
export const SHEET_MARKER = { sizeMm: 20, dxMm: 85, dyMm: 105, version: 1 } as const;

/** The kind each code names, in the order the sheets encode it. */
export const MARKER_KINDS: readonly TargetKind[] = ['sight-in', 'confirm', 'precision-prone', 'precision-standing'];

/** Markers are read on the working image scaled to this longest side: small enough to be quick, big enough for 20 mm tags. */
export const MARKER_MAX_LONGEST = 1500;

export interface SheetMarker {
  id: number;
  kind: TargetKind;
  /** 0 top left, 1 top right, 2 bottom left, 3 bottom right, as printed. */
  corner: 0 | 1 | 2 | 3;
  /** The marker's corners in image px, in the detector's order: its own top left, top right, bottom right, bottom left. */
  corners: Array<{ x: number; y: number }>;
}

export interface SheetMarkers {
  markers: SheetMarker[];
  /** The kind every marker agrees on; null when none was read or two disagree. */
  kind: TargetKind | null;
}

/** An id this app printed (version 1), as its kind and corner; null for any other tag. */
export function decodeMarkerId(id: number): { kind: TargetKind; corner: 0 | 1 | 2 | 3 } | null {
  if (!Number.isInteger(id) || id >> 4 !== SHEET_MARKER.version) return null;
  return { kind: MARKER_KINDS[(id >> 2) & 3]!, corner: (id & 3) as 0 | 1 | 2 | 3 };
}

/** The kind the markers agree on, or null. */
export function markersKind(markers: readonly Pick<SheetMarker, 'kind'>[]): TargetKind | null {
  const kinds = new Set(markers.map((m) => m.kind));
  return kinds.size === 1 ? [...kinds][0]! : null;
}

/** A marker's corners in target mm (+y up), in the detector's order. */
export function markerCornersMm(corner: 0 | 1 | 2 | 3): Array<{ xMm: number; yMm: number }> {
  const cx = (corner % 2 === 0 ? -1 : 1) * SHEET_MARKER.dxMm;
  const cy = (corner < 2 ? 1 : -1) * SHEET_MARKER.dyMm;
  const h = SHEET_MARKER.sizeMm / 2;
  return [
    { xMm: cx - h, yMm: cy + h },
    { xMm: cx + h, yMm: cy + h },
    { xMm: cx + h, yMm: cy - h },
    { xMm: cx - h, yMm: cy - h },
  ];
}

/** The detector settings measured on real sheet photos: a wider adaptive-threshold window reads markers in uneven light. */
function detectorParameters(cv: OpenCv): unknown {
  const p = new cv.aruco_DetectorParameters();
  p.adaptiveThreshWinSizeMin = 5;
  p.adaptiveThreshWinSizeMax = 83;
  p.adaptiveThreshWinSizeStep = 6;
  return p;
}

/** Every NordicAim sheet marker in the photo, with image-px corners. Other tags and unreadable candidates are ignored. */
export function detectSheetMarkers(cv: OpenCv, img: RgbaImage): SheetMarkers {
  const { mat, scale } = toGrayMat(cv, img, MARKER_MAX_LONGEST);
  const dictionary = cv.getPredefinedDictionary(cv.DICT_APRILTAG_36h11);
  const detector = new cv.aruco_ArucoDetector(dictionary, detectorParameters(cv), new cv.aruco_RefineParameters(10, 3, true));
  const corners = new cv.MatVector();
  const ids = new cv.Mat();
  const rejected = new cv.MatVector();
  try {
    detector.detectMarkers(mat, corners, ids, rejected);
    const markers: SheetMarker[] = [];
    const idList = Array.from(ids.data32S as Int32Array);
    idList.forEach((id, i) => {
      const decoded = decodeMarkerId(id);
      if (decoded === null) return;
      const c = corners.get(i).data32F as Float32Array;
      markers.push({ id, ...decoded, corners: [0, 1, 2, 3].map((j) => ({ x: c[2 * j]! / scale, y: c[2 * j + 1]! / scale })) });
    });
    // One reading per corner: the first, should a sheet somehow repeat.
    const unique = markers.filter((m, i) => markers.findIndex((n) => n.id === m.id) === i);
    return { markers: unique, kind: markersKind(unique) };
  } finally {
    mat.delete();
    ids.delete();
    corners.delete();
    rejected.delete();
    detector.delete?.();
  }
}
