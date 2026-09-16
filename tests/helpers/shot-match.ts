// M11 Tests / step 8. Greedy nearest-neighbour matching of detected shots against known truth,
// shared by `tests/unit/cv/holes.test.ts` and `scripts/cv-eval.ts`.

export interface MatchablePoint {
  xMm: number;
  yMm: number;
  multiplicity?: number;
}

/** M11 step 8: "greedy match <= 3 mm". */
export const MATCH_TOLERANCE_MM = 3;

export interface MatchResult {
  detected: number;
  truth: number;
  matched: number;
  recall: number;
  precision: number;
  meanErrorMm: number | null;
  /** Detected units minus true units: how far the multiplicities are off in total. */
  unitCountError: number;
}

function unitsOf(shots: MatchablePoint[]): number {
  return shots.reduce((sum, shot) => sum + (shot.multiplicity ?? 1), 0);
}

/**
 * Pairs each detected shot with at most one true shot, taking the closest available pair first and
 * never matching further than `toleranceMm`.
 */
export function matchShots(
  detected: MatchablePoint[],
  truth: MatchablePoint[],
  toleranceMm: number = MATCH_TOLERANCE_MM,
): MatchResult {
  const pairs: Array<{ d: number; t: number; distance: number }> = [];
  detected.forEach((shot, d) => {
    truth.forEach((actual, t) => {
      const distance = Math.hypot(shot.xMm - actual.xMm, shot.yMm - actual.yMm);
      if (distance <= toleranceMm) pairs.push({ d, t, distance });
    });
  });
  pairs.sort((a, b) => a.distance - b.distance);

  const usedDetected = new Set<number>();
  const usedTruth = new Set<number>();
  const errors: number[] = [];
  for (const pair of pairs) {
    if (usedDetected.has(pair.d) || usedTruth.has(pair.t)) continue;
    usedDetected.add(pair.d);
    usedTruth.add(pair.t);
    errors.push(pair.distance);
  }

  const matched = errors.length;
  return {
    detected: detected.length,
    truth: truth.length,
    matched,
    recall: truth.length === 0 ? 1 : matched / truth.length,
    precision: detected.length === 0 ? (truth.length === 0 ? 1 : 0) : matched / detected.length,
    meanErrorMm: matched === 0 ? null : errors.reduce((sum, e) => sum + e, 0) / matched,
    unitCountError: unitsOf(detected) - unitsOf(truth),
  };
}
