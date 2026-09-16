// Pure CV helper over `RgbaImage` (AGENTS.md pure/adapter split): no DOM, no canvas.

import { fitLongest, type RgbaImage } from '@/lib/media/format';

import type { CvMat, OpenCv } from './opencv';

/**
 * M10 step 2. RGBA image -> single-channel gray Mat, downscaled so its longest side is at most
 * `maxLongest`. `scale` is the factor from input pixels to Mat pixels (matPx = imgPx * scale), so
 * callers convert results back with `/ scale`.
 *
 * The caller owns `mat` and must `delete()` it.
 */
export function toGrayMat(cv: OpenCv, img: RgbaImage, maxLongest: number): { mat: CvMat; scale: number } {
  const src = cv.matFromImageData({ data: img.data, width: img.width, height: img.height });
  let gray: CvMat | null = null;
  try {
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const fit = fitLongest(img.width, img.height, maxLongest);
    if (fit.scale >= 1) {
      const out = gray;
      gray = null;
      return { mat: out, scale: 1 };
    }

    const resized = new cv.Mat();
    try {
      cv.resize(gray, resized, new cv.Size(fit.w, fit.h), 0, 0, cv.INTER_AREA);
    } catch (err) {
      resized.delete();
      throw err;
    }
    return { mat: resized, scale: fit.scale };
  } finally {
    src.delete();
    gray?.delete();
  }
}
