// M16 R2 (REV-35). Printed marks are removed by WHERE they are printed, not by what they look like:
// no shape measure separates a hole from a printed numeral or ring line on the owner's photos, but
// their positions are fixed by the template. Pure; no DOM.
//
// - Ring lines and dashed guides: the annuli of M11 step 4 (`printedCircleRadiiMm`, +/- 0.9 mm).
// - Ring numerals (precision sheet only): numerals 1-8 print at the centre of their ring band on four
//   axes. The sheet's rotation in the photo is unknown, so it is estimated first from the printed-mark
//   response along each band-centre circle (the 90-degree-periodic phase of sum w * e^{4i theta}).

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '@/lib/defaults/templates';
import type { TemplateId } from '@/lib/domain/enums';

import {
  NUMERAL_BOX_HALF_RADIAL_MM,
  NUMERAL_BOX_HALF_TANGENTIAL_MM,
  NUMERAL_INK_K,
  NUMERAL_INK_MIN_DELTA,
  NUMERAL_ROTATION_MIN_STRENGTH,
} from './constants';

/** M11 step 4: printed circle lines are erased over this half-width, in mm. */
export const RING_MASK_HALF_WIDTH_MM = 0.9;

/**
 * M11 step 4: "every printed circle radius", in mm, from the sheets' own geometry
 * (geometry-scoring §1.2 and §1.3). Inside the disc these lines are printed WHITE on black; outside
 * it they are dark on paper. The sighting sheet's 110 mm and 40 mm dashed guides are among them.
 */
export function printedCircleRadiiMm(template: TemplateId): number[] {
  const diameters =
    template === 'sighting'
      ? [
          SIGHTING_TEMPLATE.anchor.diameterMm,
          SIGHTING_TEMPLATE.zones.standing.solidDiameterMm,
          SIGHTING_TEMPLATE.zones.standing.guideDiameterMm,
          SIGHTING_TEMPLATE.zones.prone.solidDiameterMm,
          SIGHTING_TEMPLATE.zones.prone.guideDiameterMm,
          ...SIGHTING_TEMPLATE.unscoredCircles.map((circle) => circle.diameterMm),
        ]
      : [
          PRECISION_TEMPLATE.blackDiameterMm,
          PRECISION_TEMPLATE.innerTenDiameterMm,
          ...Object.values(PRECISION_TEMPLATE.ringDiameterMm),
        ];
  return [...new Set(diameters.map((d) => d / 2))].sort((a, b) => a - b);
}

/**
 * The band map over a square rectified grid (`side` px, `pxPerMm`, target centre in the middle): 1
 * where a pixel lies within {@link RING_MASK_HALF_WIDTH_MM} of a printed circle. The calibration's
 * own anchor radius is always included, because a manual calibration can move it off the template's.
 */
export function printedBandMap(side: number, pxPerMm: number, template: TemplateId, anchorRadiusMm: number): Uint8Array {
  const radiiMm = [...new Set([...printedCircleRadiiMm(template), anchorRadiusMm])];
  const bands = radiiMm.map((r) => ({
    lo: Math.max(0, r - RING_MASK_HALF_WIDTH_MM) * pxPerMm,
    hi: (r + RING_MASK_HALF_WIDTH_MM) * pxPerMm,
  }));
  const centre = side / 2;
  const out = new Uint8Array(side * side);
  for (let y = 0; y < side; y += 1) {
    const dy2 = (y - centre) ** 2;
    for (let x = 0; x < side; x += 1) {
      const radius = Math.sqrt((x - centre) ** 2 + dy2);
      for (const band of bands) {
        if (radius >= band.lo && radius <= band.hi) {
          out[y * side + x] = 1;
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Where numerals 8 … 1 print on the precision sheet, as radii in mm: the centre of each numeral's ring
 * band (between ring n and ring n+1). Where the black aiming mark's edge splits a band (ring 3's, 53.2
 * to 61.2 mm, split at 56.2), the numeral sits in the paper part, between the mark's edge and the ring
 * — measured on IMG_4540, where the "3" is centred there (M16 Completion notes).
 */
export function numeralCentresMm(): number[] {
  const radius = (ring: number): number =>
    PRECISION_TEMPLATE.ringDiameterMm[ring as keyof typeof PRECISION_TEMPLATE.ringDiameterMm] / 2;
  const blackRadius = PRECISION_TEMPLATE.blackDiameterMm / 2;
  const centres: number[] = [];
  for (let numeral = 8; numeral >= 1; numeral -= 1) {
    let lo = radius(numeral + 1);
    const hi = radius(numeral);
    if (blackRadius > lo && blackRadius < hi) lo = blackRadius;
    centres.push((lo + hi) / 2);
  }
  return centres;
}

export interface NumeralRotation {
  /** The sheet's numeral axes, in degrees counter-clockwise from +x in target mm, modulo 90. */
  deg: number;
  /** |sum w e^{4i theta}| / sum w: 1 when every ink sample sits exactly on the four axes. */
  strength: number;
  /** False when the signal was too weak to trust; no numeral mask is applied then. */
  reliable: boolean;
}

/** Just what {@link estimateNumeralRotation} reads: a gray square, target centre in the middle. */
export interface GraySquare {
  gray: Uint8Array;
  side: number;
  pxPerMm: number;
}

/** Offsets either side of each band centre that are sampled, in mm. */
const SAMPLE_OFFSETS_MM = [-0.75, 0, 0.75];

/**
 * R2: the numerals' rotation. Samples gray along circles at each numeral band centre, marks the
 * samples that are printed ink (far from the circle's own median, either way — numerals are white on
 * the black mark and black on paper), and fits the 90-degree-periodic phase of those samples.
 */
export function estimateNumeralRotation(square: GraySquare): NumeralRotation {
  const { gray, side, pxPerMm } = square;
  const centre = side / 2;
  let re = 0;
  let im = 0;
  let weight = 0;

  for (const bandCentre of numeralCentresMm()) {
    for (const offset of SAMPLE_OFFSETS_MM) {
      const radiusMm = bandCentre + offset;
      const n = Math.max(8, Math.round(2 * Math.PI * radiusMm * pxPerMm));
      const values = new Int16Array(n).fill(-1);
      const histogram = new Int32Array(256);
      let count = 0;
      for (let k = 0; k < n; k += 1) {
        const theta = (2 * Math.PI * k) / n;
        const x = Math.round(centre + radiusMm * Math.cos(theta) * pxPerMm);
        const y = Math.round(centre - radiusMm * Math.sin(theta) * pxPerMm);
        if (x < 0 || y < 0 || x >= side || y >= side) continue;
        const v = gray[y * side + x] as number;
        values[k] = v;
        histogram[v] = (histogram[v] as number) + 1;
        count += 1;
      }
      if (count * 2 < n) continue;
      const median = histogramMedian(histogram, count);
      const deviations = new Int32Array(256);
      for (let v = 0; v < 256; v += 1) {
        const d = Math.abs(v - median);
        deviations[d] = (deviations[d] as number) + (histogram[v] as number);
      }
      const cut = Math.max(NUMERAL_INK_MIN_DELTA, NUMERAL_INK_K * histogramMedian(deviations, count));
      for (let k = 0; k < n; k += 1) {
        const v = values[k] as number;
        if (v < 0 || Math.abs(v - median) <= cut) continue;
        const theta = (2 * Math.PI * k) / n;
        re += Math.cos(4 * theta);
        im += Math.sin(4 * theta);
        weight += 1;
      }
    }
  }

  const strength = weight === 0 ? 0 : Math.hypot(re, im) / weight;
  const deg = weight === 0 ? 0 : (Math.atan2(im, re) * 180) / Math.PI / 4;
  return { deg, strength, reliable: strength >= NUMERAL_ROTATION_MIN_STRENGTH };
}

function histogramMedian(histogram: Int32Array, count: number): number {
  let cumulative = 0;
  for (let v = 0; v < histogram.length; v += 1) {
    cumulative += histogram[v] as number;
    if (cumulative * 2 >= count) return v;
  }
  return histogram.length - 1;
}

/**
 * R2: true when a point (target mm) lies inside one of the 32 numeral boxes — 8 numerals on 4 axes
 * rotated by `rotationDeg`, each box {@link NUMERAL_BOX_HALF_RADIAL_MM} x
 * {@link NUMERAL_BOX_HALF_TANGENTIAL_MM} either side of the numeral's centre.
 */
export function inNumeralBox(xMm: number, yMm: number, rotationDeg: number): boolean {
  const radial = Math.hypot(xMm, yMm);
  const deg = (Math.atan2(yMm, xMm) * 180) / Math.PI - rotationDeg;
  // Angle to the nearest of the four axes, in (-45, 45].
  const offsetDeg = ((((deg % 90) + 90) % 90) + 45) % 90 - 45;
  const offset = (offsetDeg * Math.PI) / 180;
  const along = radial * Math.cos(offset);
  const across = radial * Math.sin(offset);
  if (Math.abs(across) > NUMERAL_BOX_HALF_TANGENTIAL_MM) return false;
  return numeralCentresMm().some((c) => Math.abs(along - c) <= NUMERAL_BOX_HALF_RADIAL_MM);
}
