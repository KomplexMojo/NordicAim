/** analysis-pipeline §3. Tuning constants for the CV steps. */

/**
 * `sharpness(cv, img)` below this adds the `image-blurry` warning (analysis-pipeline §3).
 *
 * Provisional value 40 from the spec; M10 measured the reference JPEGs and blurred copies with
 * `pnpm cv:eval` and recorded the numbers in the milestone's Completion notes.
 */
export const BLUR_THRESHOLD = 40;
