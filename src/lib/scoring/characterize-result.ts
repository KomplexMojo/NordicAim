// REV-88: attach the observable characteristics to a scored result. Pure.

import type { AnalysisResult, SubsetResult } from '../domain/analysis';
import type { Handedness } from '../domain/settings';
import type { Categorization } from '../domain/photo';
import { characterize } from './characteristics';

/**
 * The result with `characteristics` on every subset: what the group looks like and which potential issues it matches. Prone-only rules
 * run for a prone subset (a `both` target's subsets are judged by their own position, its combined subset by neither).
 */
export function withCharacteristics(
  result: AnalysisResult,
  categorization: Categorization,
  handedness: Handedness,
  /** The scoring rule's hole diameter (REV-56): the outside-the-zone share uses the same touch rule as the score. */
  holeDiameterMm: number,
): AnalysisResult {
  const one = (subset: SubsetResult): SubsetResult => {
    const position =
      subset.key === 'prone' || subset.key === 'standing'
        ? subset.key
        : categorization.position === 'prone' || categorization.position === 'standing'
          ? categorization.position
          : null;
    return { ...subset, characteristics: characterize(subset.units, { handedness, position, holeDiameterMm }) };
  };
  return { ...result, subsets: result.subsets.map(one), all: one(result.all) };
}
