// Display formatting for scoring results.
//
// geometry-scoring.md §8.1 is the only formatting rule that spec states: the `averaged` missing-round
// score "may be fractional; display with 1 decimal". The spec's own §8.1 vector writes the (whole-
// number-valued) result as "averaged 84.0", so `formatFractionalScore` always renders exactly 1
// decimal rather than dropping it for integers.
//
// rendering-composite.md §3 item 10 states the diagram's number formats — "mm 1 dp, MOA/MRAD 2 dp,
// averages 1 dp; unavailable `—`" — and M12's result cards and target-detail screen show the same
// quantities as HTML. `formatMm` / `formatAngular` are those two rules, so the screens and the
// rendered diagrams cannot drift apart.

/** Always renders with exactly 1 decimal (geometry-scoring.md §8.1: "averaged 84.0"). */
export function formatFractionalScore(value: number): string {
  return value.toFixed(1);
}

/** rendering-composite.md §3 item 10: millimetres at 1 decimal; `—` when unavailable. */
export function formatMm(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

/** rendering-composite.md §3 item 10: MOA/MRAD at 2 decimals; `—` when unavailable. */
export function formatAngular(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}
