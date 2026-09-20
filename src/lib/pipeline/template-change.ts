// analysis-pipeline §5 (REV-57, issue #10). When does changing a photo's template send it back through Stage A?
//
// Pure: no DOM, no clock, no store.

import type { TargetAnalysis } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';

/**
 * True when the template changed to a real value on a photo whose Stage A has finished and nothing on it is
 * the owner's own work. Anything manual (`analysis-pipeline.md` §8) is never re-derived behind the owner's
 * back: the change only re-scores, and Re-analyze in Adjust is the way to catch up.
 *
 * Not `pending` / `running` / `error`: a pending run will read the new template when it starts, a running
 * one is caught when it commits (`runStageA`), and an error is retried by hand.
 */
export function shouldRerunStageA(
  before: Pick<Categorization, 'template'>,
  after: Pick<Categorization, 'template'>,
  analysis: Pick<TargetAnalysis, 'calibration' | 'shots' | 'pipeline'>,
): boolean {
  if (after.template === null || after.template === before.template) return false;
  if (analysis.pipeline.stageA !== 'done') return false;
  if (analysis.calibration?.source === 'manual') return false;
  if (analysis.shots.some((shot) => shot.source === 'manual')) return false;
  return true;
}
