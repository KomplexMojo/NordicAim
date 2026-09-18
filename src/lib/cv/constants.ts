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

// --- M19 / REV-38: the coloured backing sheet (`docs/spec/backing-sheet.md`) --------------------
// Every value here is PROVISIONAL. §7 of the spec sets the evidence needed before the colour path is
// trusted: at least 10 backed target photos with a card photo each, labelled with
// `pnpm review:detection`. The numbers below are the spec's starting points, measured on three photos.

// §4, from a card photo.
/** §4.1: the card is measured over the central 60% x 60% of the image. */
export const CARD_REGION_FRACTION = 0.6;
/** §4.2: a card pixel counts when its HSV saturation is at least this... */
export const CARD_SAT_MIN = 0.3;
/** ...and its HSV value is at least this (drops shadow, white and black). */
export const CARD_VAL_MIN = 0.25;
/** §4.3: below this share of the region kept, the card has no clear colour and the measure is null. */
export const CARD_MIN_KEPT_FRACTION = 0.3;

// §4, without a card: anything clearly coloured is backing.
/** §4.1: "white" is the median of pixels at least this bright (max channel, 0-255)... */
export const NEUTRAL_WHITE_MIN_MAX = 150;
/** ...and this close to neutral (max - min, 0-255). */
export const NEUTRAL_WHITE_MAX_CHROMA = 40;
/** §4.3: after the white balance, a pixel is backing at this chroma (max - min, 0-255) or above. */
export const NEUTRAL_CHROMA_MIN = 40;

// §5, the colour mask from a card's signature.
/** §5.1: a pixel is backing within this many degrees beyond the card's own hue spread. */
export const BACKING_HUE_MARGIN_DEG = 25;
/** §5.1: and at this saturation or above — the floor... */
export const BACKING_SAT_FLOOR = 0.25;
/** ...or this multiple of the card's `satP10`, whichever is larger. No minimum brightness is applied. */
export const BACKING_SAT_P10_FACTOR = 0.7;
/** §5.1: the morphological opening (px, on the rectified square) that removes printed-edge fringes. */
export const BACKING_OPEN_PX = 3;
/** §5.2: a component below this fraction of one hole's area is dropped. */
export const BACKING_MIN_AREA_FRACTION = 0.08;
/** §5.3: components whose centroids lie within this fraction of a hole DIAMETER are one blob. */
export const BACKING_MERGE_FRACTION = 0.6;
/** §5.5: a blob at this multiple of the median blob area is flagged `possibleOverlap` (a hint only). */
export const BACKING_OVERLAP_RATIO = 1.8;

// §4a, `Auto`: is a coloured backing present in this photo?
/** §4a: at least this many coloured blobs in the search area. */
export const AUTO_MIN_SPOTS = 3;
/** §4a: and no coloured blob larger than this multiple of one hole's area (scenery, not a hole). */
export const AUTO_MAX_BLOB_RATIO = 2.5;
