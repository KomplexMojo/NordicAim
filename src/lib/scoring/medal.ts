// REV-80 / REV-81: the star on a precision target. Pure.

export type Medal = 'gold' | 'silver' | 'bronze' | 'none';

/**
 * Above 90 is gold, 80 to 90 silver, 70 up to 80 bronze, and below 70 no star at all (`none`: a plain circle
 * that just states the score, with no endorsement of it; the owner, 2026-09-20). The bands are for a full
 * ten-round target scored out of 100; a shorter target is judged by the same share of its maximum, so a five-round 46 out of 50 is
 * gold.
 */
export function medalFor(total: number, maxPossible: number): Medal {
  const score = maxPossible <= 0 ? 0 : (total / maxPossible) * 100;
  if (score > 90) return 'gold';
  if (score >= 80) return 'silver';
  if (score >= 70) return 'bronze';
  return 'none';
}
