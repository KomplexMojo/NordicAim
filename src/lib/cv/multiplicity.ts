// M21 step 3 / REV-41: a hole too wide to be one shot is offered as a double punch. Pure.
//
// It is ONLY ever a prompt: automatic detection still stores multiplicity 1 (REV-28), and the user's
// one tap is what sets it.

/** REV-41: a .22 hole is 5.6 mm ± 5%. */
export const HOLE_DIAMETER_TOLERANCE = 0.05;
/** The Inspector's ceiling (data-model §4: `multiplicity` is an integer in [1, 20]). */
export const MAX_SUGGESTED_MULTIPLICITY = 20;

/**
 * M21 step 3. Below `holeDiameterMm × (1 + HOLE_DIAMETER_TOLERANCE)` a hole is one shot (1). Beyond it,
 * the whole number of hole widths the measured width spans — rounded up, so any hole materially wider
 * than one shot is at least 2 — capped at the Inspector's 20. See M21 Open questions: the milestone's
 * "60 mm → 20" vector does not follow from this rule, which gives 11.
 */
export function suggestedMultiplicity(widthMm: number, holeDiameterMm: number): number {
  if (!Number.isFinite(widthMm) || !(holeDiameterMm > 0)) return 1;
  if (widthMm <= holeDiameterMm * (1 + HOLE_DIAMETER_TOLERANCE)) return 1;
  return Math.min(MAX_SUGGESTED_MULTIPLICITY, Math.max(2, Math.ceil(widthMm / holeDiameterMm)));
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

/**
 * M21 step 3: the "looks like N shots" prompt for one shot, or `null` for none. Only an automatic shot
 * whose multiplicity nobody has set is ever proposed: a `manual` shot was decided by the user in an
 * earlier save, and `userSet` covers a change made on screen that has not been saved yet. The prompt
 * only ever raises the count — a hole already at N or more is left alone.
 */
export function doublePunchProposal(
  shot: { multiplicity: number; source: 'auto' | 'manual' },
  widthMm: number | null,
  holeDiameterMm: number,
  userSet: boolean,
): number | null {
  if (userSet || shot.source === 'manual' || widthMm === null) return null;
  const n = suggestedMultiplicity(widthMm, holeDiameterMm);
  return n > shot.multiplicity ? n : null;
}
