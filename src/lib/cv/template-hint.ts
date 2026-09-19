// analysis-pipeline §2 (A3): the template hint. Pure over `RgbaImage`; no DOM.
//
// M23 (issue #5) replaced M10 step 5's transition count, which tied at a median of 4 on the sighting
// sheet and so called it precision. The signal now is the one geometry-scoring §1.2-§1.3 draws between
// the two sheets: the precision sheet prints ring lines EVENLY SPACED (8 mm apart in radius) across its
// black aiming mark, the sighting sheet only a few circles at fixed radii (dashed 110 and 40 mm guides,
// a solid 45 mm circle and a small inner circle). Walking rays out from the disc centre, the radial
// gray profile of a precision sheet is periodic; a sighting sheet's is not.

import type { TemplateId } from '@/lib/domain/enums';
import type { CalibrationLike } from '@/lib/geometry/transform';
import type { RgbaImage } from '@/lib/media/format';

import { TEMPLATE_PERIODICITY_SPAN, TEMPLATE_PERIODICITY_THRESHOLD } from './constants';
import { toGrayMat } from './gray';
import type { OpenCv } from './opencv';

export const HINT_MAX_LONGEST = 1200;

/** Rays walked out from the disc centre, evenly spaced in the ellipse's own frame. */
const RAY_COUNT = 32;
/** Each ray is sampled at this many points per disc radius (nearest pixel). */
const SAMPLES_PER_RADIUS = 400;
/**
 * The profile runs from 0.1 R to 0.9 R: inside the inner ten and the sighting sheet's small circle's
 * clutter of holes at the centre, and short of the disc edge, whose step would dominate every spectrum.
 */
const PROFILE_START = 0.1;
const PROFILE_END = 0.9;
/**
 * Candidate ring periods, as a fraction of the measured disc radius. The precision rings are 8 mm apart
 * on a 56.2 mm disc (0.142 R); the range is scale-free so a disc measured on the wrong circle (IMG_4745,
 * whose A4 disc lands on ring 6) or a capture prior that is ~40% off still finds the rings.
 */
const PERIOD_MIN = 0.08;
const PERIOD_MAX = 0.3;
const PERIOD_STEP = 0.005;
/**
 * Half-width of the running median behind the line response, as a fraction of R (12 samples): wide
 * against a printed line, narrow against the 0.142 R ring spacing.
 */
const LINE_WINDOW = 0.03;
/**
 * The line response is smoothed with a Gaussian of this sigma (a fraction of R) so that thin, sharp
 * lines and thick, blurred ones put their power in the same fundamental band rather than in harmonics.
 * Measured (M23): at 0.01 the synthetic sheet's 0.35 mm lines sat within 0.1 of the photos' sighting
 * sheets; at 0.02 every precision sheet, real or synthetic, clears every sighting sheet by at least 0.16.
 */
const LINE_SIGMA = 0.02;
/** A candidate band covers periods within this factor either side of its centre. */
const PERIOD_BAND_FACTOR = 1.15;

export interface TemplateHint {
  template: TemplateId;
  confidence: number;
}

/**
 * One ray's radial gray profile over [PROFILE_START, PROFILE_END] R, or null when any sample falls
 * outside the image. `phi` is the angle in the ellipse's own frame (0 = along the major axis).
 */
function rayProfile(
  data: Uint8Array,
  cols: number,
  rows: number,
  cal: CalibrationLike,
  scale: number,
  phi: number,
): number[] | null {
  const cx = cal.cx * scale;
  const cy = cal.cy * scale;
  const radius = cal.radiusPx * scale;
  const theta = (cal.angleDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);

  const first = Math.round(PROFILE_START * SAMPLES_PER_RADIUS);
  const last = Math.round(PROFILE_END * SAMPLES_PER_RADIUS);
  const profile: number[] = [];
  for (let i = first; i < last; i += 1) {
    const t = (i / SAMPLES_PER_RADIUS) * radius;
    // Point on the ray in the ellipse frame, then rotated into image space (geometry-scoring §2.1 step 3).
    const u = t * cosP;
    const v = t * cal.axisRatio * sinP;
    const x = Math.round(cx + u * cosT - v * sinT);
    const y = Math.round(cy + u * sinT + v * cosT);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
    profile.push(data[y * cols + x] as number);
  }
  return lineResponse(profile);
}

/**
 * The ring-line response along a ray: how far each sample departs, either way, from the median of the
 * samples within LINE_WINDOW of it, then smoothed. A printed line (white on the black, dark on paper)
 * stands out; the disc's own edge, a slow shadow and the paper/ink levels do not.
 */
function lineResponse(profile: number[]): number[] {
  const half = Math.round(LINE_WINDOW * SAMPLES_PER_RADIUS);
  const raw = profile.map((value, i) => {
    const window = profile.slice(Math.max(0, i - half), i + half + 1).sort((a, b) => a - b);
    return Math.abs(value - (window[window.length >> 1] as number));
  });
  const sigma = LINE_SIGMA * SAMPLES_PER_RADIUS;
  const reach = Math.ceil(3 * sigma);
  const kernel = Array.from({ length: 2 * reach + 1 }, (_, j) => Math.exp(-((j - reach) ** 2) / (2 * sigma * sigma)));
  return raw.map((_, i) => {
    let sum = 0;
    let weight = 0;
    kernel.forEach((w, j) => {
      const value = raw[i + j - reach];
      if (value === undefined) return;
      sum += w * value;
      weight += w;
    });
    return sum / weight;
  });
}

/**
 * The share of each DFT bin k = 1 … n/2 − 1 in the profile's total power (mean removed), so every
 * ray weighs the same whatever its contrast. Index 0 of the result is bin 1.
 */
function normalisedSpectrum(profile: number[], cosTable: Float64Array, sinTable: Float64Array): number[] {
  const n = profile.length;
  const mean = profile.reduce((sum, value) => sum + value, 0) / n;
  const centred = profile.map((value) => value - mean);
  const power: number[] = [];
  let total = 0;
  for (let k = 1; k < n / 2; k += 1) {
    let re = 0;
    let im = 0;
    for (let j = 0; j < n; j += 1) {
      const index = (k * j) % n;
      const value = centred[j] as number;
      re += value * (cosTable[index] as number);
      im -= value * (sinTable[index] as number);
    }
    const p = re * re + im * im;
    power.push(p);
    total += p;
  }
  return power.map((p) => (total > 0 ? p / total : 0));
}

/**
 * M23: how periodic the black disc's radial profile is — the largest share of the profile's power
 * (averaged over RAY_COUNT rays) in any band of periods [c / 1.15, c * 1.15] with c from 0.08 R to
 * 0.3 R. Evenly spaced ring lines concentrate power in one band; a few circles at fixed radii spread
 * it. Null when no ray lies wholly inside the image. `cal` is in the pixel space of `img`.
 */
export function ringPeriodicity(cv: OpenCv, img: RgbaImage, cal: CalibrationLike): number | null {
  const { mat: gray, scale } = toGrayMat(cv, img, HINT_MAX_LONGEST);
  const spectra: number[][] = [];
  let n = 0;
  try {
    const cols = gray.cols as number;
    const rows = gray.rows as number;
    const data = gray.data as Uint8Array;
    let cosTable = new Float64Array(0);
    let sinTable = new Float64Array(0);
    for (let r = 0; r < RAY_COUNT; r += 1) {
      const profile = rayProfile(data, cols, rows, cal, scale, (r * 2 * Math.PI) / RAY_COUNT);
      if (profile === null) continue;
      if (n === 0) {
        n = profile.length;
        cosTable = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * i) / n));
        sinTable = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / n));
      }
      spectra.push(normalisedSpectrum(profile, cosTable, sinTable));
    }
  } finally {
    gray.delete();
  }
  if (spectra.length === 0) return null;

  const bins = (spectra[0] as number[]).length;
  const average = new Array<number>(bins).fill(0);
  for (const spectrum of spectra) {
    spectrum.forEach((share, i) => {
      average[i] = (average[i] as number) + share / spectra.length;
    });
  }

  let best = 0;
  const steps = Math.round((PERIOD_MAX - PERIOD_MIN) / PERIOD_STEP);
  for (let s = 0; s <= steps; s += 1) {
    const centre = PERIOD_MIN + s * PERIOD_STEP;
    let band = 0;
    average.forEach((share, i) => {
      // Bin k = i + 1 has a period of n / k samples, i.e. (n / k) / SAMPLES_PER_RADIUS of R.
      const period = n / (i + 1) / SAMPLES_PER_RADIUS;
      if (period >= centre / PERIOD_BAND_FACTOR && period <= centre * PERIOD_BAND_FACTOR) band += share;
    });
    best = Math.max(best, band);
  }
  return best;
}

/**
 * M23: `ringPeriodicity >= TEMPLATE_PERIODICITY_THRESHOLD` → precision, else sighting;
 * `confidence = clamp(|periodicity − threshold| / TEMPLATE_PERIODICITY_SPAN, 0, 1)`. With no usable
 * ray the hint is precision at confidence 0 — below every consumer's threshold, as M10's tie was.
 */
export function hintTemplate(cv: OpenCv, img: RgbaImage, cal: CalibrationLike): TemplateHint {
  const periodicity = ringPeriodicity(cv, img, cal);
  if (periodicity === null) return { template: 'precision', confidence: 0 };
  const template: TemplateId = periodicity >= TEMPLATE_PERIODICITY_THRESHOLD ? 'precision' : 'sighting';
  const confidence = Math.min(1, Math.max(0, Math.abs(periodicity - TEMPLATE_PERIODICITY_THRESHOLD) / TEMPLATE_PERIODICITY_SPAN));
  return { template, confidence };
}
