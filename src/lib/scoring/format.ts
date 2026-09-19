// Display formatting for scoring results. (REV-39 / M20 removed the fractional `averaged` score and
// its formatter along with the score range.)
//
// rendering-composite.md §3 item 10 states the diagram's number formats — "mm 1 dp, MOA/MRAD 2 dp,
// averages 1 dp; unavailable `—`" — and M12's result cards and target-detail screen show the same
// quantities as HTML. `formatMm` / `formatAngular` are those two rules, so the screens and the
// rendered diagrams cannot drift apart.

/** rendering-composite.md §3 item 10: millimetres at 1 decimal; `—` when unavailable. */
export function formatMm(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

/** rendering-composite.md §3 item 10: MOA/MRAD at 2 decimals; `—` when unavailable. */
export function formatAngular(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}
