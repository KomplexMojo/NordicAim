// REV-39 (M20): declared rounds are fact. `reconcileRounds` reconciles the holes detection found in
// one subset against the rounds the shooter declared for it, before anything is scored:
//
//   * clearly more holes than rounds  -> the subset is REJECTED (no score; the shots are kept);
//   * a few low-confidence extras     -> REV-28's cap (keep the confident ones, fill with the best);
//   * fewer holes than rounds         -> double punches first, then the rest are MISSES;
//   * exactly the declared rounds     -> nothing inferred, overlap evidence ignored.
//
// Pure: no Date.now(), no randomness, no DOM (AGENTS.md determinism rule).

import { ranked } from './cap-shots';

/**
 * Step 3: a subset is rejected when its confident holes exceed the declared rounds by more than this.
 * **0** — the owner, 2026-09-17: "the declared count is fact", confirmed "1 extra is fine, keep
 * rejection at any excess".
 */
export const REJECT_MARGIN = 0;

/**
 * Step 2: on the standard path a hole is *confident* when its detection confidence is at least this.
 *
 * Measured on the owner's labelled holes (M16 R4, `ground-truth-holes-v2.json`, 35 gated photos, 255
 * detections of which 237 match a labelled hole), with the pipeline's own A4 (REV-44) and A5. Precision
 * among detections at or above a threshold is not monotonic: it first reaches 0.98 at 0.883 (68/69) but
 * falls back to 0.962 at 0.935, where the last false detection sits (0.93506). **0.94** is the lowest
 * round value at which precision is at least 0.98 at every higher threshold too: 22 of 22 detections are
 * real holes (precision 1.00), about 9% of the real holes found. So on the standard path the reject rule
 * fires only on holes the detector is nearly certain of — see the milestone's Completion notes.
 */
export const CONFIDENT_HOLE_MIN = 0.94;

/**
 * Step 5.1, colour path: a hole may be a double punch when its coloured area is at least this many
 * times the photo's median hole (the start value, = BACKING_OVERLAP_RATIO). Measured on the owner's
 * backing photos with the REV-44 alignment: the known double punches read 2.18x (IMG_5189, 9 shots on
 * 8 holes) and 2.11x (IMG_5191), while every other hole on those two photos reads <= 1.25x. The two long
 * tears on IMG_5193 (2.19x, 1.88x) also clear it, which is why nothing is inferred when every round is
 * already accounted for.
 */
export const DOUBLE_PUNCH_MIN_RATIO = 1.8;

/**
 * Step 5.1, standard path: `null` — **no** standard-path hole qualifies as a double punch. Measured on
 * the owner's labelled holes: of 13 holes the owner called multi-shot and 219 single holes, a blob-area
 * ratio >= 1.8 (to the photo's median) catches 2 doubles and 25 singles, and no threshold on the area
 * ratio, the area over a nominal hole, or elongation does better than about 1 double for every 8
 * singles. On this path a short count is therefore scored as misses; M21 (REV-41) offers doubles to the
 * user instead.
 */
export const DOUBLE_PUNCH_MIN_RATIO_STANDARD: number | null = null;

/** Step 1: one hole detection found, as reconciliation sees it. */
export interface FoundHole {
  id: string;
  xMm: number;
  yMm: number;
  /** The detector's confidence (null on the colour path). Used by REV-28's ranking. */
  confidence: number | null;
  /** Step 2: a hole the detector is sure of. Only confident holes can reject a target. */
  confident: boolean;
  /**
   * Overlap evidence: the hole's area over the photo's median hole area (the coloured area on the
   * colour path). Null when it was not measured.
   */
  overlapRatio: number | null;
  /** REV-28's area tie-break, when known. */
  areaMm2?: number;
}

/** What double-punch inference needs to know about the detection path the holes came from. */
export interface RoundsEvidence {
  /** Step 5.1: the overlap ratio a hole must clear to take a second round; null = infer none. */
  doublePunchMinRatio: number | null;
}

export type ReconcileOutcome = 'rejected' | 'capped' | 'exact' | 'short';

export interface Reconciliation {
  outcome: ReconcileOutcome;
  /** How many found holes are confident (step 2). */
  confident: number;
  /** The holes that are scored, in input order. On `rejected` every hole is kept (for Adjust). */
  kept: FoundHole[];
  /** Step 4: holes dropped by the cap. */
  dropped: FoundHole[];
  /** Step 5.2: extra rounds inferred per hole id; only holes that took at least one appear. */
  extraShots: Record<string, number>;
  /** Step 5.3: declared rounds with no hole at all, scored as misses. */
  missesAssumed: number;
}

/** Strongest overlap evidence first; ties by id so the order is total. */
function byEvidence(a: FoundHole, b: FoundHole): number {
  return (b.overlapRatio ?? 0) - (a.overlapRatio ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Step 5: double punches first (one extra each, then a third where the evidence is twice as strong). */
function inferDoubles(found: FoundHole[], short: number, minRatio: number | null): { extraShots: Record<string, number>; left: number } {
  const extraShots: Record<string, number> = {};
  let left = short;
  if (minRatio === null) return { extraShots, left };

  const qualifying = found.filter((hole) => hole.overlapRatio !== null && hole.overlapRatio >= minRatio).sort(byEvidence);
  for (const hole of qualifying) {
    if (left === 0) break;
    extraShots[hole.id] = 1;
    left -= 1;
  }
  // A third round only once every qualifying hole already has two, and only on twice the evidence.
  for (const hole of qualifying) {
    if (left === 0) break;
    if ((hole.overlapRatio ?? 0) < 2 * minRatio) continue;
    extraShots[hole.id] = 2;
    left -= 1;
  }
  return { extraShots, left };
}

/**
 * REV-39 / M20 step 1. Reconciles one subset's found holes against its declared rounds. `declared` is
 * the rounds still to be accounted for by these holes (the caller subtracts the owner's own units).
 */
export function reconcileRounds(found: FoundHole[], declared: number, evidence: RoundsEvidence): Reconciliation {
  const budget = Math.max(0, declared);
  const confident = found.filter((hole) => hole.confident).length;
  const base = { confident, dropped: [] as FoundHole[], extraShots: {} as Record<string, number>, missesAssumed: 0 };

  // Step 3: clearly more holes than rounds. Nothing is scored, nothing is discarded.
  if (confident > budget + REJECT_MARGIN) return { ...base, outcome: 'rejected', kept: [...found] };

  // Step 4: a few low-confidence extras. Keep every confident hole, fill with the best of the rest.
  if (found.length > budget) {
    const fill = found
      .filter((hole) => !hole.confident)
      .sort(ranked)
      .slice(0, budget - confident);
    const keep = new Set<FoundHole>([...found.filter((hole) => hole.confident), ...fill]);
    return {
      ...base,
      outcome: 'capped',
      kept: found.filter((hole) => keep.has(hole)),
      dropped: found.filter((hole) => !keep.has(hole)),
    };
  }

  // Every round accounted for: overlap evidence is ignored (long tears look like overlaps).
  if (found.length === budget) return { ...base, outcome: 'exact', kept: [...found] };

  // Step 5: fewer holes than rounds — double punches, then misses.
  const { extraShots, left } = inferDoubles(found, budget - found.length, evidence.doublePunchMinRatio);
  return { ...base, outcome: 'short', kept: [...found], extraShots, missesAssumed: left };
}
