// M10 step 5 / analysis-pipeline §2 (A3). Walks 16 rays out from the anchor centre and counts
// dark->light transitions: the precision sheet prints many white ring lines inside its black aiming
// mark, the sighting sheet only a couple. Pure over `RgbaImage`; no DOM.

import type { TemplateId } from '@/lib/domain/enums';
import type { CalibrationLike } from '@/lib/geometry/transform';
import type { RgbaImage } from '@/lib/media/format';

import { toGrayMat } from './gray';
import type { CvMat, OpenCv } from './opencv';

export const HINT_MAX_LONGEST = 1200;

const RAY_COUNT = 16;
/** Transitions are counted within 0.95 * R (M10 step 5), so the disc edge itself never counts. */
const RAY_LIMIT = 0.95;
/** Half-pixel steps keep 1 px ring lines while still allowing a run-length filter. */
const SAMPLE_STEP_PX = 0.5;
/** A run shorter than this is noise and is merged into the run before it (1 px at the step above). */
const MIN_RUN_SAMPLES = 2;
/** A ray is used only if this fraction of its samples lies inside the image. */
const MIN_IN_BOUNDS = 0.5;

export interface TemplateHint {
  template: TemplateId;
  confidence: number;
}

function otsuThreshold(cv: OpenCv, gray: CvMat): number {
  const tmp = new cv.Mat();
  try {
    return cv.threshold(gray, tmp, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU) as number;
  } finally {
    tmp.delete();
  }
}

/** Median of a non-empty list; even lengths average the two middle values. */
export function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Counts dark->light transitions along one ray, or null when too much of the ray falls outside the
 * image. `phi` is the angle in the ellipse's own frame (0 = along the major axis).
 */
function countTransitions(
  gray: CvMat,
  cal: CalibrationLike,
  scale: number,
  phi: number,
  threshold: number,
): number | null {
  const cols = gray.cols as number;
  const rows = gray.rows as number;
  const data = gray.data as Uint8Array;

  const cx = cal.cx * scale;
  const cy = cal.cy * scale;
  const radius = cal.radiusPx * scale;
  const theta = (cal.angleDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);

  const maxDistance = RAY_LIMIT * radius;
  const steps = Math.max(8, Math.ceil(maxDistance / SAMPLE_STEP_PX));

  const dark: boolean[] = [];
  let inBounds = 0;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * maxDistance;
    // Point on the ray in the ellipse frame, then rotated into image space (geometry-scoring §2.1 step 3).
    const u = t * cosP;
    const v = t * cal.axisRatio * sinP;
    const x = Math.round(cx + u * cosT - v * sinT);
    const y = Math.round(cy + u * sinT + v * cosT);
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    inBounds += 1;
    dark.push((data[y * cols + x] as number) < threshold);
  }

  if (inBounds < (steps + 1) * MIN_IN_BOUNDS || dark.length === 0) return null;

  // Run-length encode, dropping runs shorter than MIN_RUN_SAMPLES into the previous run.
  const runs: Array<{ dark: boolean; length: number }> = [];
  for (const isDark of dark) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last.dark === isDark) last.length += 1;
    else runs.push({ dark: isDark, length: 1 });
  }
  const merged: Array<{ dark: boolean; length: number }> = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last !== undefined && run.length < MIN_RUN_SAMPLES) {
      last.length += run.length;
      continue;
    }
    if (last !== undefined && last.dark === run.dark) last.length += run.length;
    else merged.push({ ...run });
  }

  let transitions = 0;
  for (let i = 1; i < merged.length; i += 1) {
    if ((merged[i - 1] as { dark: boolean }).dark && !(merged[i] as { dark: boolean }).dark) transitions += 1;
  }
  return transitions;
}

/**
 * M10 step 5: median transition count over 16 rays; >= 5 -> precision, <= 3 -> sighting, otherwise the
 * nearer of the two; `confidence = clamp(|median - 4| / 4, 0, 1)`. `cal` is in the pixel space of `img`.
 */
export function hintTemplate(cv: OpenCv, img: RgbaImage, cal: CalibrationLike): TemplateHint {
  const { mat: gray, scale } = toGrayMat(cv, img, HINT_MAX_LONGEST);
  try {
    const threshold = otsuThreshold(cv, gray);
    const counts: number[] = [];
    for (let i = 0; i < RAY_COUNT; i += 1) {
      const count = countTransitions(gray, cal, scale, (i * 2 * Math.PI) / RAY_COUNT, threshold);
      if (count !== null) counts.push(count);
    }

    const median = counts.length === 0 ? 0 : medianOf(counts);
    let template: TemplateId;
    if (median >= 5) template = 'precision';
    else if (median <= 3) template = 'sighting';
    // "else nearest": a median of exactly 4 is a tie, and its confidence is 0 either way.
    else template = Math.abs(median - 5) <= Math.abs(median - 3) ? 'precision' : 'sighting';

    const confidence = Math.min(1, Math.max(0, Math.abs(median - 4) / 4));
    return { template, confidence };
  } finally {
    gray.delete();
  }
}
