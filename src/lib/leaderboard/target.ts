// leaderboard.md §2–§3 (issue #42): one stored precision target as the board sees it. Pure.

import type { Shot, TargetAnalysis } from '../domain/analysis';
import { declaredRoundsOrNull } from '../domain/categorization';
import type { TargetPhoto } from '../domain/photo';
import { baselineShots, isEdited } from './baseline';
import { correctionCheck, type BoardPosition, type CorrectionCheck } from './score';

type PhotoPart = Pick<TargetPhoto, 'categorization'>;
type AnalysisPart = Pick<TargetAnalysis, 'calibration' | 'shots' | 'computed' | 'autoBaseline'>;

export interface ScoredBoardTarget {
  position: BoardPosition;
  declared: number;
  finalShots: Shot[];
  /** The automatic shots, or null when the target was corrected before they were kept. */
  autoShots: Shot[] | null;
  check: CorrectionCheck;
}

/** A scored precision target with a position and its rounds, read under the board rule; null for anything else. */
export function boardTarget(photo: PhotoPart, analysis: AnalysisPart | null): ScoredBoardTarget | null {
  const { template, position } = photo.categorization;
  const declared = declaredRoundsOrNull(photo.categorization);
  if (template !== 'precision' || position === null || declared === null) return null;
  if (analysis === null || analysis.calibration === null || analysis.computed === null) return null;
  const edited = isEdited(analysis);
  const autoShots = baselineShots(analysis);
  return {
    position,
    declared,
    finalShots: analysis.shots,
    autoShots,
    check: correctionCheck(analysis.shots, autoShots, edited, position, declared),
  };
}
