/** analysis-pipeline §3. Tuning constants for the CV steps. */

/**
 * `sharpness(cv, img)` below this adds the `image-blurry` warning (analysis-pipeline §3).
 *
 * Provisional value 40 from the spec; M10 measured the reference JPEGs and blurred copies with
 * `pnpm cv:eval` and recorded the numbers in the milestone's Completion notes.
 */
export const BLUR_THRESHOLD = 40;

// --- M16 / REV-27: the printed-glyph filter ------------------------------------------------------
// A bullet hole is a compact blob; a printed ring numeral is a thin stroke. Both constants were
// measured on the owner's real photos — see M16's Completion notes for the measured separation.

/**
 * REV-27: reject a component whose fitted ellipse is longer than this (major / minor).
 *
 * Measured on `docs/reference/IMG_5132-precision.jpg` (M16 Completion notes): elongation does **not**
 * separate printed numerals from holes — a numeral is a roundish blob, so the two ranges overlap
 * completely (glyphs 1.00–6.15, holes 1.06–3.48). The value sits just above the largest real hole
 * measured, so the test only removes the long thin remnants of printed ring lines, and the stroke
 * test below is what actually rejects the numerals.
 */
export const ELONGATION_MAX = 4;

/**
 * REV-27: reject a component whose maximum inscribed radius (the distance-transform peak) is below
 * this fraction of the hole radius (`holeDiameterMm / 2`).
 */
export const STROKE_MIN_FRACTION = 0.35;
// Measured separation on `IMG_5132-precision.jpg` with the CV-measured calibration: printed numerals
// peak at 0.36–0.92 mm, real holes at 1.04–2.98 mm. 0.35 × 2.8 mm = 0.98 mm falls in that gap.

// --- M16 / REV-32: the region scan ---------------------------------------------------------------

/** REV-32: the side of one scan tile, in mm. Tiles are stepped at half this, so a hole that
 * straddles one tile boundary is whole inside its neighbour. */
export const REGION_MM = 12;
// Measured (M16 Completion notes): 8 mm starves the statistics (a hole fills its own tile), 15 mm
// over-detects. 12 mm is also the smallest tile that GUARANTEES the half-stride claim for a 5.6 mm
// hole: tile - hole = 6.4 mm >= the 6 mm stride, so every hole is whole inside at least one tile.

/** REV-32: a candidate pixel is more than this many MADs from its tile's median, in the direction
 * the tile's class implies (brighter on the aiming mark, darker on paper). */
export const REGION_K = 5;
// Measured on both reference photos with the CV-measured calibration (M16 Completion notes):
// k=3 over-detects (17-20 on a 10-round sheet), k=4 gives 13, k=6 starves (4-8). k=5 gives 10
// detections on the precision sheet and 7 on the sighting sheet, none of them on a printed numeral.

/** REV-32: a tile that produced a candidate is re-run at most this many more times, at
 * progressively lower `REGION_K`. Refinement never chases a shot quota. */
export const REGION_REFINE_MAX = 3;

/** REV-32: each refinement pass multiplies `REGION_K` by this. */
export const REGION_REFINE_FACTOR = 0.75;

/**
 * REV-32: the floor under a tile's MAD. Gray levels are 8-bit integers, so a perfectly flat tile
 * measures MAD 0 and every threshold built from it would collapse to "any pixel that differs at all".
 */
export const REGION_MAD_FLOOR = 1;

/** M16 step 1: the segmentation `detectShots` uses unless a caller asks for the other one. */
export const DEFAULT_DETECTION_METHOD: 'global' | 'region' = 'region';
