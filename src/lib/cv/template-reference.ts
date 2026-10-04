// template-reference.md §3 step 3 (M26, REV-121): keep only a blank sheet's target circles. Everything farther than
// `outerRadiusMm + REFERENCE_MARGIN_MM` from the target centre (in target mm, through the calibration) is painted the
// median paper colour just beyond that radius, then the image is cropped to a square around the circles.
//
// Pure over RgbaImage; no DOM, no OpenCV.

import type { TemplateId } from '@/lib/domain/enums';
import { outerRadiusMm } from '@/lib/cv/rectify';
import { pxToMm, type CalibrationLike } from '@/lib/geometry/transform';
import type { RgbaImage } from '@/lib/media/format';

/** §3 step 3: paper kept beyond the outermost printed circle, in mm. */
export const REFERENCE_MARGIN_MM = 3;
/** §3 step 3: the crop is a square of half-side `outerRadiusMm + REFERENCE_CROP_MARGIN_MM` around the centre. */
export const REFERENCE_CROP_MARGIN_MM = 10;
/** The band the paper colour is sampled from, in mm beyond the kept radius. */
const PAPER_BAND_MM: readonly [number, number] = [2, 8];
/** Every third pixel is enough for a median colour. */
const PAPER_SAMPLE_STEP = 3;

function median(values: number[]): number {
  if (values.length === 0) return 255;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] as number;
}

/** The kept radius, in mm, for a template. */
export function referenceKeepRadiusMm(template: TemplateId): number {
  return outerRadiusMm(template) + REFERENCE_MARGIN_MM;
}

/** Pixels per mm at the target centre, from the calibration's anchor disc. */
function pxPerMm(cal: CalibrationLike): number {
  return cal.radiusPx / (cal.anchorDiameterMm / 2);
}

export interface KeptCircles {
  image: RgbaImage;
  /** Where the crop's top-left corner sat in the source image, in px. */
  origin: { x: number; y: number };
  paper: [number, number, number];
}

/**
 * §3 step 3. Returns a new image; `img` is not modified. The crop is clamped to the source image, so a sheet
 * photographed close to an edge gives a smaller (possibly non-square) result rather than invented pixels.
 */
export function keepTargetCircles(img: RgbaImage, cal: CalibrationLike, template: TemplateId): KeptCircles {
  const { data, width, height } = img;
  const keepR = referenceKeepRadiusMm(template);
  const radiusAt = (x: number, y: number): number => {
    const p = pxToMm({ x, y }, cal);
    return Math.hypot(p.xMm, p.yMm);
  };

  const band: [number[], number[], number[]] = [[], [], []];
  const outside: [number[], number[], number[]] = [[], [], []];
  for (let y = 0; y < height; y += PAPER_SAMPLE_STEP) {
    for (let x = 0; x < width; x += PAPER_SAMPLE_STEP) {
      const r = radiusAt(x, y);
      if (r <= keepR) continue;
      const i = (y * width + x) * 4;
      const target = r > keepR + PAPER_BAND_MM[0] && r < keepR + PAPER_BAND_MM[1] ? band : outside;
      for (let c = 0; c < 3; c += 1) target[c]!.push(data[i + c] as number);
    }
  }
  const source = band[0].length > 0 ? band : outside;
  const paper: [number, number, number] = [median(source[0]), median(source[1]), median(source[2])];

  const half = Math.round((outerRadiusMm(template) + REFERENCE_CROP_MARGIN_MM) * pxPerMm(cal));
  const x0 = Math.max(0, Math.round(cal.cx - half));
  const y0 = Math.max(0, Math.round(cal.cy - half));
  const x1 = Math.min(width, Math.round(cal.cx + half));
  const y1 = Math.min(height, Math.round(cal.cy + half));
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const si = ((y + y0) * width + (x + x0)) * 4;
      const di = (y * w + x) * 4;
      if (radiusAt(x + x0, y + y0) > keepR) {
        out[di] = paper[0];
        out[di + 1] = paper[1];
        out[di + 2] = paper[2];
      } else {
        out[di] = data[si] as number;
        out[di + 1] = data[si + 1] as number;
        out[di + 2] = data[si + 2] as number;
      }
      out[di + 3] = 255;
    }
  }
  return { image: { data: out, width: w, height: h }, origin: { x: x0, y: y0 }, paper };
}

/** Why a photo was refused as a reference (§3 step 2 and step 4). */
export type ReferenceRefusal = 'no-disc' | 'wrong-template';

/** §3 step 2: the same threshold as the `template-mismatch` warning (analysis-pipeline §2 B4). */
export const REFERENCE_WRONG_TEMPLATE_CONFIDENCE = 0.5;

/**
 * §3 step 2: a photo is refused when A4 finds no disc, or when the template hint names the other template with
 * confidence ≥ 0.5. Null means it may be used.
 */
export function referenceRefusal(
  discFound: boolean,
  hint: { template: TemplateId; confidence: number } | null,
  template: TemplateId,
): ReferenceRefusal | null {
  if (!discFound) return 'no-disc';
  if (hint !== null && hint.template !== template && hint.confidence >= REFERENCE_WRONG_TEMPLATE_CONFIDENCE) return 'wrong-template';
  return null;
}
