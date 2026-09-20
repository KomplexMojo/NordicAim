// REV-80: the star on a precision target. Pure.

export type Medal = 'gold' | 'silver' | 'bronze';

/**
 * Above 90 is gold, 80 to 90 silver, below 80 bronze (the owner, 2026-09-20). The bands are for a full ten-round target scored
 * out of 100; a shorter target is judged by the same share of its maximum, so a five-round 46 out of 50 is gold.
 */
export function medalFor(total: number, maxPossible: number): Medal {
  const score = maxPossible <= 0 ? 0 : (total / maxPossible) * 100;
  if (score > 90) return 'gold';
  if (score >= 80) return 'silver';
  return 'bronze';
}
