// Display formatting for scoring results.
//
// geometry-scoring.md §8.1 is the only formatting rule the spec states: the `averaged` missing-round
// score "may be fractional; display with 1 decimal". The spec's own §8.1 vector writes the (whole-
// number-valued) result as "averaged 84.0", so this always renders exactly 1 decimal rather than
// dropping it for integers — matching the spec's literal example instead of inventing a whole-number
// special case. No other display rules (units, locale, MOA/MRAD precision, etc.) are specified here,
// and later UI milestones own how these values actually render. This module intentionally stays
// minimal — see the milestone's Open questions.

/** Always renders with exactly 1 decimal (geometry-scoring.md §8.1: "averaged 84.0"). */
export function formatFractionalScore(value: number): string {
  return value.toFixed(1);
}
