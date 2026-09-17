// M11 step 1 / analysis-pipeline §2 (A5). Warps the working image into a canonical, square,
// axis-aligned view of the target at a fixed 8 px/mm, so hole detection can reason in millimetres
// whatever the photo's resolution, rotation or perspective. Pure over `RgbaImage`; no DOM.

import { overlayCircles } from '@/lib/capture/overlay';
import type { TemplateId } from '@/lib/domain/enums';
import { mmToPx, type CalibrationLike } from '@/lib/geometry/transform';
import type { RgbaImage } from '@/lib/media/format';

import { toGrayMat } from './gray';
import type { CvMat, OpenCv } from './opencv';

/** M11 step 1: the rectified view is a fixed 8 px per mm. */
export const CANONICAL_PX_PER_MM = 8;

/** M11 step 1: the square side is `2 * (outerRadiusMm + 10) * 8`. */
export const RECTIFIED_MARGIN_MM = 10;

/** M11 step 1 samples the mm -> px affine at these three target-space points. */
const AFFINE_SAMPLE_MM = [
  { xMm: 0, yMm: 0 },
  { xMm: 10, yMm: 0 },
  { xMm: 0, yMm: 10 },
] as const;

/**
 * The outermost printed circle of a template, as a radius in mm. M11 step 1 says `outerRadiusMm`
 * without defining it; `capture-overlay.md` §3.1 already names exactly this quantity
 * (`overlayCircles(template).outerDiameterMm`: the 115 mm sighting disc, the precision sheet's
 * 154.4 mm ring 1), so that is what is used here. See the milestone's Open questions.
 */
export function outerRadiusMm(template: TemplateId): number {
  return overlayCircles(template).outerDiameterMm / 2;
}

/** M11 step 1: `2 * (outerRadiusMm + 10) * 8`, rounded to whole pixels. */
export function rectifiedSidePx(template: TemplateId): number {
  return Math.round(2 * (outerRadiusMm(template) + RECTIFIED_MARGIN_MM) * CANONICAL_PX_PER_MM);
}

/** The square geometry shared by {@link rectifiedToMm} and {@link mmToRectified}. */
export interface RectifiedGeometry {
  side: number;
  pxPerMm: number;
}

/**
 * M16 R3 (REV-36): detection rectifies a larger area than M11's crop, at a coarser scale. Every field
 * defaults to M11 step 1 (8 px/mm, `outerRadiusMm + 10`, no chroma).
 */
export interface RectifyOptions {
  pxPerMm?: number;
  /** Half the square's side, in mm. */
  radiusMm?: number;
  /** Also warp the per-pixel chroma (`max(R,G,B) - min(R,G,B)`), which sheet segmentation reads. */
  chroma?: boolean;
}

export interface Rectified extends RectifiedGeometry {
  /**
   * CV_8UC1, `side` x `side`. Target centre at `(side/2, side/2)`, +x right, +y **down** (image
   * convention, as everywhere else in pixel space). The caller owns it and must `delete()` it.
   */
  gray: CvMat;
  /**
   * CV_8UC1, 255 where the warp read a real source pixel. Everything the warp had to invent lies
   * outside the photo and must not be read as ink or as paper. The caller must `delete()` it.
   */
  valid: CvMat;
  /** CV_8UC1 chroma, only when {@link RectifyOptions.chroma} was asked for. The caller deletes it. */
  chroma: CvMat | null;
}

/** Per-pixel `max(R,G,B) - min(R,G,B)` as a CV_8UC1 Mat the caller owns. */
function chromaMat(cv: OpenCv, img: RgbaImage): CvMat {
  const mat = new cv.Mat(img.height, img.width, cv.CV_8UC1);
  const out = mat.data as Uint8Array;
  const data = img.data;
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    const r = data[p] as number;
    const g = data[p + 1] as number;
    const b = data[p + 2] as number;
    out[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  return mat;
}

/** Rectified px -> target mm (geometry-scoring §2: origin at the centre, +x right, +y up). */
export function rectifiedToMm(p: { x: number; y: number }, geom: RectifiedGeometry): { xMm: number; yMm: number } {
  const centre = geom.side / 2;
  return { xMm: (p.x - centre) / geom.pxPerMm, yMm: (centre - p.y) / geom.pxPerMm };
}

/** Target mm -> rectified px. Exact inverse of {@link rectifiedToMm}. */
export function mmToRectified(p: { xMm: number; yMm: number }, geom: RectifiedGeometry): { x: number; y: number } {
  const centre = geom.side / 2;
  return { x: centre + p.xMm * geom.pxPerMm, y: centre - p.yMm * geom.pxPerMm };
}

/**
 * M11 step 1. Builds the affine that takes target mm to working px by evaluating `mmToPx` at
 * (0,0), (10,0) and (0,10) — three points are exactly what an affine needs, and going through
 * `mmToPx` keeps the one transform definition (geometry-scoring §2.1) — then inverts it and warps
 * the gray working image into the canonical square.
 */
export function rectify(
  cv: OpenCv,
  img: RgbaImage,
  calibration: CalibrationLike,
  template: TemplateId,
  options: RectifyOptions = {},
): Rectified {
  const pxPerMm = options.pxPerMm ?? CANONICAL_PX_PER_MM;
  const side =
    options.radiusMm === undefined && options.pxPerMm === undefined
      ? rectifiedSidePx(template)
      : Math.round(2 * (options.radiusMm ?? outerRadiusMm(template) + RECTIFIED_MARGIN_MM) * pxPerMm);
  const geom: RectifiedGeometry = { side, pxPerMm };

  const rectifiedFlat: number[] = [];
  const workingFlat: number[] = [];
  for (const p of AFFINE_SAMPLE_MM) {
    const rectified = mmToRectified(p, geom);
    rectifiedFlat.push(rectified.x, rectified.y);
    const working = mmToPx(p, calibration);
    workingFlat.push(working.x, working.y);
  }

  // Full resolution: the calibration is expressed in working px, so nothing may be downscaled here.
  const { mat: gray } = toGrayMat(cv, img, Math.max(img.width, img.height));

  const fromPoints = cv.matFromArray(3, 1, cv.CV_32FC2, rectifiedFlat);
  const toPoints = cv.matFromArray(3, 1, cv.CV_32FC2, workingFlat);
  let forward: CvMat | null = null;
  const inverse = new cv.Mat();
  const ones = new cv.Mat(gray.rows as number, gray.cols as number, cv.CV_8UC1, new cv.Scalar(255, 255, 255, 255));
  const out = new cv.Mat();
  const valid = new cv.Mat();
  const chromaSource = options.chroma === true ? chromaMat(cv, img) : null;
  const chroma = chromaSource === null ? null : new cv.Mat();

  try {
    forward = cv.getAffineTransform(fromPoints, toPoints); // rectified px -> working px
    cv.invertAffineTransform(forward, inverse); // working px -> rectified px

    const size = new cv.Size(side, side);
    const outside = new cv.Scalar(0, 0, 0, 0);
    cv.warpAffine(gray, out, inverse, size, cv.INTER_LINEAR, cv.BORDER_CONSTANT, outside);
    // Nearest neighbour: the mask must stay strictly 0 or 255, with no blended edge.
    cv.warpAffine(ones, valid, inverse, size, cv.INTER_NEAREST, cv.BORDER_CONSTANT, outside);
    if (chromaSource !== null && chroma !== null) {
      cv.warpAffine(chromaSource, chroma, inverse, size, cv.INTER_LINEAR, cv.BORDER_CONSTANT, outside);
    }

    return { gray: out, valid, chroma, side, pxPerMm };
  } catch (err) {
    out.delete();
    valid.delete();
    chroma?.delete();
    throw err;
  } finally {
    gray.delete();
    fromPoints.delete();
    toPoints.delete();
    forward?.delete();
    inverse.delete();
    ones.delete();
    chromaSource?.delete();
  }
}
