// analysis-pipeline §3: the variance of `cv.Laplacian` (CV_64F, ksize 1) on the gray image resized to
// longest 1200 px. Pure over `RgbaImage`; no DOM.

import type { RgbaImage } from '@/lib/media/format';

import { toGrayMat } from './gray';
import type { CvMat, OpenCv } from './opencv';

export const SHARPNESS_MAX_LONGEST = 1200;

export function sharpness(cv: OpenCv, img: RgbaImage): number {
  const { mat: gray } = toGrayMat(cv, img, SHARPNESS_MAX_LONGEST);
  let lap: CvMat | null = null;
  let mean: CvMat | null = null;
  let stddev: CvMat | null = null;
  try {
    lap = new cv.Mat();
    cv.Laplacian(gray, lap, cv.CV_64F, 1, 1, 0, cv.BORDER_DEFAULT);
    mean = new cv.Mat();
    stddev = new cv.Mat();
    cv.meanStdDev(lap, mean, stddev);
    const sd = stddev.doubleAt(0, 0) as number;
    return sd * sd;
  } finally {
    gray.delete();
    lap?.delete();
    mean?.delete();
    stddev?.delete();
  }
}
