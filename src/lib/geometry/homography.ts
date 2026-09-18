// M18 step 2. A projective mapping (homography) between target mm and image px, for the case the
// ellipse calibration cannot express: a sheet photographed off-axis. A circle seen under perspective
// projects to an ellipse whose centre is NOT the image of the circle's centre, so rings drawn
// concentric around a fitted ellipse drift off the printed rings — most visibly at the middle, which
// is where the 10 and 9 rings are.
//
// Pure math, no DOM. Coordinates follow geometry-scoring §2: mm with +y UP, px with +y DOWN. The flip
// lives inside the matrix, exactly as it does inside `mmToPx`.
//
// NOTE (M18 step 2 is an owner gate): nothing here is stored. `Calibration` still holds the ellipse,
// and this module is used by the measurement scripts and tests only until the owner ratifies a shape.

import { mmToPx, type CalibrationLike } from './transform';

/**
 * Row-major 3x3, mapping the homogeneous target point `[xMm, yMm, 1]` to homogeneous image px.
 * `m[8]` is kept at 1 by every constructor here: the target centre maps to `(m[2], m[5])`, so a
 * homography that sends the centre to infinity is not representable — and never wanted.
 */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

/**
 * The ellipse calibration as a homography, read straight out of `mmToPx` so the two can never drift
 * apart: an affine map is determined by the images of the origin and the two unit vectors.
 */
export function homographyFromCalibration(cal: CalibrationLike): Homography {
  const o = mmToPx({ xMm: 0, yMm: 0 }, cal);
  const ex = mmToPx({ xMm: 1, yMm: 0 }, cal);
  const ey = mmToPx({ xMm: 0, yMm: 1 }, cal);
  return [ex.x - o.x, ey.x - o.x, o.x, ex.y - o.y, ey.y - o.y, o.y, 0, 0, 1];
}

/** `a · b`, row-major. */
export function multiplyHomography(a: Homography, b: Homography): Homography {
  const out = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) sum += (a[row * 3 + k] as number) * (b[k * 3 + col] as number);
      out[row * 3 + col] = sum;
    }
  }
  return normalize(out as unknown as Homography);
}

/** Scales the matrix so `m[8] === 1`. Throws when the target centre would map to infinity. */
export function normalize(h: Homography): Homography {
  const w = h[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) throw new Error('homography: m[8] is zero');
  return h.map((v) => v / w) as unknown as Homography;
}

/** The inverse, via the adjugate. Throws when `h` is singular. */
export function invertHomography(h: Homography): Homography {
  const [a, b, c, d, e, f, g, i, j] = h;
  const c00 = e * j - f * i;
  const c01 = f * g - d * j;
  const c02 = d * i - e * g;
  const det = a * c00 + b * c01 + c * c02;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) throw new Error('homography: singular');
  const adj: Homography = [
    c00,
    c * i - b * j,
    b * f - c * e,
    c01,
    a * j - c * g,
    c * d - a * f,
    c02,
    b * g - a * i,
    a * e - b * d,
  ];
  return normalize(adj.map((v) => v / det) as unknown as Homography);
}

/** Target mm (+y up) -> image px (+y down). The projective replacement for `mmToPx`. */
export function mmToPxH(p: { xMm: number; yMm: number }, h: Homography): { x: number; y: number } {
  const w = h[6] * p.xMm + h[7] * p.yMm + h[8];
  return { x: (h[0] * p.xMm + h[1] * p.yMm + h[2]) / w, y: (h[3] * p.xMm + h[4] * p.yMm + h[5]) / w };
}

/**
 * Image px -> target mm. The projective replacement for `pxToMm`. Pass `inverse` (from
 * {@link invertHomography}) when mapping many points with the same homography.
 */
export function pxToMmH(p: { x: number; y: number }, h: Homography, inverse?: Homography): { xMm: number; yMm: number } {
  const inv = inverse ?? invertHomography(h);
  const w = inv[6] * p.x + inv[7] * p.y + inv[8];
  return { xMm: (inv[0] * p.x + inv[1] * p.y + inv[2]) / w, yMm: (inv[3] * p.x + inv[4] * p.y + inv[5]) / w };
}

/** The image of the target centre, in px — the point the printed rings are concentric about. */
export function centrePx(h: Homography): { x: number; y: number } {
  return { x: h[2] / h[8], y: h[5] / h[8] };
}

/** A rotation by `deg` counter-clockwise about the target centre, in target mm space. */
export function rotationMm(deg: number): Homography {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/**
 * The perspective factor applied in target space: `[[1,0,0],[0,1,0],[p,q,1]]`. `(p, q)` is the target
 * plane's vanishing line in mm coordinates, and `p = q = 0` is the affine (ellipse) case.
 */
export function perspectiveMm(p: number, q: number): Homography {
  return [1, 0, 0, 0, 1, 0, p, q, 1];
}

/** d(px)/d(mm) at the target centre, row-major 2x2 `[dx/dX, dx/dY, dy/dX, dy/dY]`. */
export function jacobianAtCentre(h: Homography): [number, number, number, number] {
  const [a, b, c, d, e, f, g, i, j] = h;
  const k = 1 / (j * j);
  return [(a * j - c * g) * k, (b * j - c * i) * k, (d * j - f * g) * k, (e * j - f * i) * k];
}

/**
 * The affine (ellipse-model) homography that agrees with `h` at the target centre: same centre, same
 * local scale, rotation and shear, but no perspective. Fitting an ELLIPSE to measured points means
 * fitting an affine map, so a fit that starts from a projective `h` must start from this instead —
 * an affine correction of a projective map is still projective, and the answer would not be an
 * ellipse at all.
 */
export function affinePartAtCentre(h: Homography): Homography {
  const [a, b, c, d] = jacobianAtCentre(h);
  const centre = centrePx(h);
  return [a, b, centre.x, c, d, centre.y, 0, 0, 1];
}

/**
 * Concentric circles are rotationally symmetric, so the sheet's own rotation in its plane cannot be
 * measured from them — under any model. That freedom is harmless for rings but not for shots: a
 * rotated mm frame would swing every shot's `(xMm, yMm)` around the centre. This pins it, returning
 * `h · R(theta)` for the rotation whose local frame at the centre is closest to `reference`'s
 * (orthogonal Procrustes on the 2x2 Jacobians), so a refit never silently rotates the target.
 */
export function alignRotationGauge(h: Homography, reference: Homography): Homography {
  const [a0, a1, a2, a3] = jacobianAtCentre(h);
  const [b0, b1, b2, b3] = jacobianAtCentre(reference);
  // M = Jᵀ_h · J_reference
  const m00 = a0 * b0 + a2 * b2;
  const m01 = a0 * b1 + a2 * b3;
  const m10 = a1 * b0 + a3 * b2;
  const m11 = a1 * b1 + a3 * b3;
  const theta = Math.atan2(m10 - m01, m00 + m11);
  return multiplyHomography(h, rotationMm((theta * 180) / Math.PI));
}
