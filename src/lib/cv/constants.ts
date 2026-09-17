/** analysis-pipeline §3. Tuning constants for the CV steps. */

/**
 * `sharpness(cv, img)` below this adds the `image-blurry` warning (analysis-pipeline §3).
 *
 * Provisional value 40 from the spec; M10 measured the reference JPEGs and blurred copies with
 * `pnpm cv:eval` and recorded the numbers in the milestone's Completion notes.
 */
export const BLUR_THRESHOLD = 40;

// --- M16 rework (REV-34 to REV-37) --------------------------------------------------------------
// Every value below was measured on the owner's 390 labelled holes
// (`fixtures/private/review/ground-truth-holes-2026-09-17.json`, gated photos only) with `pnpm cv:eval`
// and the probes recorded in M16's Completion notes. Distances are in mm unless named otherwise.

/**
 * R3: the rectified detection scale. The owner's working images (1200 px long side) put the sheet at
 * 2.5-6.4 px/mm, so 4 px/mm keeps the 150 mm search square at 1200 px, the working image's own size
 * (M11's 8 px/mm would make it 2400 px and only interpolate).
 */
export const DETECTION_PX_PER_MM = 4;

// --- R3 (REV-36): the paper sheet --------------------------------------------------------------

/** R3: nothing further than this from the target centre is ever searched. */
export const SHEET_SEARCH_CAP_MM = 150;
/** R3: when the sheet cannot be segmented, the search falls back to this radius (and says so). */
export const SHEET_FALLBACK_RADIUS_MM = 105;
/** R3: the segmented sheet is eroded by this much, so the sheet's own edge is never a candidate. */
export const SHEET_ERODE_MM = 3;
/** R3: the paper reference is sampled in this annulus beyond the outermost printed circle. */
export const SHEET_SEED_INNER_MM = 1.5;
export const SHEET_SEED_OUTER_MM = 6;
/** R3: paper may be this many gray levels darker than the reference (shadow across the sheet). */
export const SHEET_GRAY_DROP = 80;
/**
 * R3: paper keeps the reference's chroma/gray ratio within this. Measured: the owner's sheets are
 * bluish white (reference chroma 2-83 against gray 171-207 across the 40 photos) while the backing board beside them is grayer, so
 * chroma separates the two where brightness does not.
 */
export const SHEET_CHROMA_RATIO_DELTA = 0.12;
/** R3: a pixel whose smoothed gradient exceeds this (gray levels per px at 4 px/mm) is a sheet edge. */
export const SHEET_EDGE_MAX = 6;
/** R3: an OPEN of this diameter breaks thin bridges from the sheet onto the board. */
export const SHEET_OPEN_MM = 3;
/**
 * R3: segmentation fails when the reference annulus is darker than this — it is not paper. Measured:
 * 171-207 on the 39 photos whose sheet segments; 33 on IMG_4745, where the annulus lands on a ring line.
 */
export const SHEET_MIN_PAPER_GRAY = 100;
/** R3: segmentation also fails when less than this share of the reference annulus looks like paper. */
export const SHEET_MIN_SEED_COVERAGE = 0.5;

// --- R1 (REV-34): polarity-free hole candidates --------------------------------------------------

/** R1: the local background is the median over a square this many hole diameters wide. */
export const HOLE_BACKGROUND_DIAMETERS = 3;
/** R1: a pixel deviates, either way, when |gray - background| > K x the surface's median deviation. */
export const HOLE_DEVIATION_K = 3;
/** R1: floor under that median deviation (8-bit gray, so a flat surface measures 0). */
export const HOLE_DEVIATION_FLOOR = 2;
/** R1: a candidate is a peak where at least this share of a hole-sized disc deviates. */
export const HOLE_SCORE_MIN = 0.5;
/** R1: the share map is smoothed with a Gaussian of this fraction of the hole radius before peaks. */
export const HOLE_PEAK_SIGMA_FRACTION = 0.2;
/** R1: on the black aiming mark a candidate needs at least this share. */
export const HOLE_MARK_SCORE_MIN = 0.6;
/** R1: on paper a hole shows the board through it: its core differs from the paper by at least this. */
export const HOLE_PAPER_CONTRAST_MIN = 40;
/** R1: on paper a hole stands alone: at most this share of the ring 1.6-3 hole radii out deviates. */
export const HOLE_PAPER_SURROUND_MAX = 0.15;
/** R1: on paper a hole is compact: its component's fitted-moment elongation is at most this. */
export const HOLE_PAPER_ELONGATION_MAX = 3;

// --- REV-27 (kept by measurement, see M16 Completion notes) ---------------------------------------

/** REV-27: reject a component longer than this (major / minor). */
export const ELONGATION_MAX = 4;
/** REV-27: reject a component whose maximum inscribed radius is below this fraction of the hole radius. */
export const STROKE_MIN_FRACTION = 0.35;

// --- R2 (REV-35): numerals -----------------------------------------------------------------------

/**
 * R2: the numeral boxes. Measured on IMG_4540 at 10 px/mm: a printed numeral is about 4 mm tall
 * (radial) and 2.5-3 mm wide (tangential); each box adds 0.5 mm radially and 1 mm tangentially for
 * the rotation estimate's error.
 */
export const NUMERAL_BOX_HALF_RADIAL_MM = 2.5;
export const NUMERAL_BOX_HALF_TANGENTIAL_MM = 2.5;
/** R2: a band-circle sample is numeral ink when it is this far from the circle's median, in gray levels... */
export const NUMERAL_INK_MIN_DELTA = 30;
/** ...or this many median deviations, whichever is larger. */
export const NUMERAL_INK_K = 5;
/** R2: below this phase strength the rotation is not trusted and no numeral mask is applied. */
export const NUMERAL_ROTATION_MIN_STRENGTH = 0.3;
/**
 * R2: a candidate inside a numeral box on the black mark survives only with at least this score.
 * Measured on the gated photos: the labelled holes inside a box score 0.69-0.95, the false detections
 * there 0.67-0.68. No labelled hole sits inside a numeral box on paper (numerals 1-3), so there no
 * candidate survives at all.
 */
export const NUMERAL_KEEP_SCORE = 0.685;
