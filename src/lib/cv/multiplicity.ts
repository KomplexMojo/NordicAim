// M21 step 3 / REV-41: a hole too wide to be one shot is offered as a double punch. Pure.
//
// It is ONLY ever a prompt: automatic detection still stores multiplicity 1 (REV-28), and the user's
// one tap is what sets it.

/** REV-41: a .22 hole is 5.6 mm ± 5%. */
export const HOLE_DIAMETER_TOLERANCE = 0.05;
/** The Inspector's ceiling (data-model §4: `multiplicity` is an integer in [1, 20]). */
export const MAX_SUGGESTED_MULTIPLICITY = 20;
/** The area equivalent of HOLE_DIAMETER_TOLERANCE's ±5% on diameter: area scales with the square. */
export const HOLE_AREA_TOLERANCE = (1 + HOLE_DIAMETER_TOLERANCE) ** 2 - 1;

/**
 * M21 step 3. Below `holeDiameterMm × (1 + HOLE_DIAMETER_TOLERANCE)` a hole is one shot (1). Beyond it,
 * the whole number of hole widths the measured width spans — rounded up, so any hole materially wider
 * than one shot is at least 2 — capped at the Inspector's 20.
 *
 * This models a **linear tear** (N holes strung in a line has width ~= N x one hole's diameter). It is
 * the wrong model for a **compact cluster** of separate overlapping holes, whose combined area scales
 * with N directly while the equivalent circular diameter only scales with sqrt(N) — so this formula
 * undercounts a cluster increasingly as it grows (owner's photos, 2026-09-26: a measured 7.4x-area
 * cluster read as 3 shots here, not 7). Kept for a genuine tear; the colour path's blobs are compact
 * clusters (backing-sheet.md §5's merge rule joins nearby separate holes, not a single elongated
 * puncture), so it uses {@link suggestedMultiplicityFromArea} instead.
 */
export function suggestedMultiplicity(widthMm: number, holeDiameterMm: number): number {
  if (!Number.isFinite(widthMm) || !(holeDiameterMm > 0)) return 1;
  if (widthMm <= holeDiameterMm * (1 + HOLE_DIAMETER_TOLERANCE)) return 1;
  return Math.min(MAX_SUGGESTED_MULTIPLICITY, Math.max(2, Math.ceil(widthMm / holeDiameterMm)));
}

/**
 * Owner finding, 2026-09-26: the colour path's own area measurement, read directly as a shot count for
 * a compact cluster of overlapping holes (area scales with N, not with N's square root the way a linear
 * width does — see {@link suggestedMultiplicity}'s note). Below `1 + HOLE_AREA_TOLERANCE` of one hole's
 * area, it is one shot; beyond it, the nearest whole number of hole-areas, at least 2, capped at 20.
 *
 * Owner note, 2026-09-26: this reads the opening's area as if it were N clean circular punctures, but a
 * tight, high-energy cluster can tear away the paper "web" between adjacent holes, making the opening
 * *larger* than N holes' worth of area — the opposite failure direction from the old width-based formula
 * this replaced (which undercounted). So this is a better estimate, not an exact count: it can still run
 * high on a very tight group, which is exactly why it stays a prompt for the owner to confirm (REV-28/41)
 * rather than ever being applied automatically.
 */
export function suggestedMultiplicityFromArea(areaMm2: number, holeDiameterMm: number): number {
  if (!(areaMm2 > 0) || !(holeDiameterMm > 0)) return 1;
  const oneHoleAreaMm2 = Math.PI * (holeDiameterMm / 2) ** 2;
  const ratio = areaMm2 / oneHoleAreaMm2;
  if (ratio <= 1 + HOLE_AREA_TOLERANCE) return 1;
  return Math.min(MAX_SUGGESTED_MULTIPLICITY, Math.max(2, Math.round(ratio)));
}

/**
 * The diameter of the disc with a hole's measured area: the width M21 reads for the colour path, whose
 * coloured area is the opening itself (backing-sheet.md §5.4). The standard path supplies no width — its
 * blob area is not a hole measurement (M21 Open questions: measured, 66% of real single holes would read
 * wider than one shot).
 */
export function equivalentDiameterMm(areaMm2: number): number {
  if (!(areaMm2 > 0)) return 0;
  return 2 * Math.sqrt(areaMm2 / Math.PI);
}

/**
 * The measured width of the detected hole nearest `point`, when one lies within `maxDistanceMm` of it —
 * which is how a shot on screen finds the width the worker measured for its hole. `null` when no
 * detected hole is that close (a shot the user placed on a hole the detector never saw).
 */
export function measuredWidthMm(
  point: { xMm: number; yMm: number },
  holes: Array<{ xMm: number; yMm: number; widthMm: number }>,
  maxDistanceMm: number,
): number | null {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const hole of holes) {
    const d = Math.hypot(hole.xMm - point.xMm, hole.yMm - point.yMm);
    if (d < maxDistanceMm && d < bestDistance) {
      best = hole.widthMm;
      bestDistance = d;
    }
  }
  return best;
}

/** As {@link measuredWidthMm}, but for the colour path's own area measurement (§5's compact-cluster model). */
export function measuredAreaMm2(
  point: { xMm: number; yMm: number },
  holes: Array<{ xMm: number; yMm: number; areaMm2: number }>,
  maxDistanceMm: number,
): number | null {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const hole of holes) {
    const d = Math.hypot(hole.xMm - point.xMm, hole.yMm - point.yMm);
    if (d < maxDistanceMm && d < bestDistance) {
      best = hole.areaMm2;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * M21 step 3: the "looks like N shots" prompt for one shot, or `null` for none. Only an automatic shot
 * whose multiplicity nobody has set is ever proposed: a `manual` shot was decided by the user in an
 * earlier save, and `userSet` covers a change made on screen that has not been saved yet. The prompt
 * only ever raises the count — a hole already at N or more is left alone.
 */
export function doublePunchProposal(
  shot: { multiplicity: number; source: 'auto' | 'manual' },
  areaMm2: number | null,
  holeDiameterMm: number,
  userSet: boolean,
): number | null {
  if (userSet || shot.source === 'manual' || areaMm2 === null) return null;
  const n = suggestedMultiplicityFromArea(areaMm2, holeDiameterMm);
  return n > shot.multiplicity ? n : null;
}
