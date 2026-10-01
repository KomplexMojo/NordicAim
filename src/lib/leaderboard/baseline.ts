// leaderboard.md §3 (issue #42): the automatic baseline — what the app scored before anyone corrected it. Pure.

import type { Shot, TargetAnalysis } from '../domain/analysis';

type Corrected = Pick<TargetAnalysis, 'calibration' | 'shots'>;

/** The shots or the ring alignment were changed by hand (analysis-pipeline §8's `manual` sources). */
export function isEdited(analysis: Corrected): boolean {
  return analysis.calibration?.source === 'manual' || analysis.shots.some((shot) => shot.source === 'manual');
}

/**
 * The automatic shots to compare with: while nothing was corrected they are simply the current shots (so a fresh
 * re-detection is always the baseline); once corrected, the snapshot kept at the first correction, or null when the
 * target was corrected before snapshots were kept.
 */
export function baselineShots(analysis: Corrected & Pick<TargetAnalysis, 'autoBaseline'>): Shot[] | null {
  if (!isEdited(analysis)) return analysis.shots;
  return analysis.autoBaseline?.shots ?? null;
}

/**
 * Called on every saved correction: the first time an automatically scored target is corrected, keep its automatic shots.
 * A snapshot already kept is never replaced, and a target the app never scored (no alignment, no result) gets none.
 */
export function keepBaseline(before: TargetAnalysis, after: TargetAnalysis, nowIso: string): TargetAnalysis {
  if (after.autoBaseline != null || isEdited(before) || !isEdited(after)) return after;
  if (before.calibration === null || before.computed === null) return after;
  return { ...after, autoBaseline: { shots: before.shots, recordedAt: nowIso } };
}
