// leaderboard.md §2–§3 (issue #42): how a precision target scores on the board, and whether a hand correction is flagged.
// Pure: no clock, no storage.

import type { Shot } from '../domain/analysis';
import { BIATHLON_50M } from '../defaults/biathlon';
import { analyzeTarget } from '../scoring/analyze';

/** One rule for every shooter: official gauge touch with the full .22 LR hole, whatever a phone's Settings say. */
export const BOARD_HOLE_DIAMETER_MM = BIATHLON_50M.holeDiameterMm;

/** A correction moving the score by more than this many points out of 100, either way, is flagged (owner, 2026-10-01). */
export const CORRECTION_FLAG_POINTS = 10;

export type BoardPosition = 'prone' | 'standing';

/** A board score as shown: whole percent. */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export interface BoardScore {
  /** The ring total as a percentage of the maximum (points out of 100 for a 10-round target); missed rounds score 0. */
  percent: number;
  xCount: number;
  /** Extreme spread, mm; null below two located shots. */
  groupMm: number | null;
}

/** A precision target scored under the board rule, from its shots alone. */
export function boardScore(shots: readonly Shot[], position: BoardPosition, declared: number): BoardScore {
  const categorization = {
    template: 'precision' as const,
    position,
    roundsProne: position === 'prone' ? declared : null,
    roundsStanding: position === 'standing' ? declared : null,
  };
  // The default profile is the board's: official gauge with BIATHLON_50M's hole.
  const result = analyzeTarget({ template: 'precision', categorization, shots: [...shots] });
  const precision = result.all.precision!;
  return {
    percent: precision.maxPossible === 0 ? 0 : (100 * precision.identifiedTotal) / precision.maxPossible,
    xCount: precision.xCount,
    groupMm: result.all.extremeSpreadMm,
  };
}

export interface CorrectionCheck {
  /** The shots or the ring alignment were changed by hand. */
  edited: boolean;
  /** The automatic score, or null when there is no automatic baseline to compare with. */
  auto: BoardScore | null;
  final: BoardScore;
  /** `final - auto` in points out of 100; null without a baseline. */
  deltaPoints: number | null;
  /** The correction moved the score by more than {@link CORRECTION_FLAG_POINTS}, either way. */
  flagged: boolean;
}

/** leaderboard.md §3: compares a target's final shots with its automatic ones. */
export function correctionCheck(
  finalShots: readonly Shot[],
  baselineShots: readonly Shot[] | null,
  edited: boolean,
  position: BoardPosition,
  declared: number,
): CorrectionCheck {
  const final = boardScore(finalShots, position, declared);
  const auto = baselineShots === null ? null : boardScore(baselineShots, position, declared);
  const deltaPoints = auto === null ? null : final.percent - auto.percent;
  return { edited, auto, final, deltaPoints, flagged: deltaPoints !== null && Math.abs(deltaPoints) > CORRECTION_FLAG_POINTS };
}
