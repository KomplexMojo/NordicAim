// leaderboard.md §4 (issue #42): which of the shooter's targets make their submission — the top 5 per position, of all time.
// Pure: no clock, no storage.

import type { ScoredBoardTarget } from './target';
import type { BoardPosition } from './score';

/** A submission is exactly this many targets per position; fewer and there is no submission for it (owner, 2026-10-01). */
export const SUBMISSION_SIZE = 5;

export interface MyBoardTarget extends ScoredBoardTarget {
  photoId: string;
  sessionId: string;
  /** `YYYY-MM-DD`, the session's date. */
  sessionDate: string;
}

/** leaderboard.md §4: higher score, then more Xs, then the smaller group, then the earlier date (ISSF-style); id last for a stable order. */
export function compareTargets(a: MyBoardTarget, b: MyBoardTarget): number {
  const fa = a.check.final;
  const fb = b.check.final;
  if (fa.percent !== fb.percent) return fb.percent - fa.percent;
  if (fa.xCount !== fb.xCount) return fb.xCount - fa.xCount;
  if (fa.groupMm !== fb.groupMm) {
    if (fa.groupMm === null) return 1;
    if (fb.groupMm === null) return -1;
    return fa.groupMm - fb.groupMm;
  }
  if (a.sessionDate !== b.sessionDate) return a.sessionDate < b.sessionDate ? -1 : 1;
  return a.photoId < b.photoId ? -1 : a.photoId > b.photoId ? 1 : 0;
}

export interface SubmissionPreview {
  position: BoardPosition;
  /** The best targets, at most {@link SUBMISSION_SIZE}, best first. */
  targets: MyBoardTarget[];
  /** How many eligible targets the shooter has in this position. */
  available: number;
  /** There are {@link SUBMISSION_SIZE}, so this position can be submitted. */
  complete: boolean;
  /** Average board score of `targets`; null when there are none. */
  average: number | null;
  /** Any of `targets` was corrected by hand / flagged. */
  edited: boolean;
  flagged: boolean;
}

/** leaderboard.md §4: the shooter's submission for one position, as the Board screen previews it. */
export function previewSubmission(all: readonly MyBoardTarget[], position: BoardPosition): SubmissionPreview {
  const mine = all.filter((t) => t.position === position);
  const targets = [...mine].sort(compareTargets).slice(0, SUBMISSION_SIZE);
  return {
    position,
    targets,
    available: mine.length,
    complete: targets.length === SUBMISSION_SIZE,
    average: targets.length === 0 ? null : targets.reduce((sum, t) => sum + t.check.final.percent, 0) / targets.length,
    edited: targets.some((t) => t.check.edited),
    flagged: targets.some((t) => t.check.flagged),
  };
}
