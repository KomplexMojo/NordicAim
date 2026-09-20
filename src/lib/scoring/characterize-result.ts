// REV-88: attach the observable characteristics to a scored result. Pure.

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '../defaults/templates';
import type { AnalysisResult, SubsetResult } from '../domain/analysis';
import type { Handedness } from '../domain/settings';
import type { Categorization } from '../domain/photo';
import { characterize } from './characteristics';

/** The black disc's radius in mm: the precision disc, or the sighting target's standing disc. */
export function discRadiusMm(template: 'precision' | 'sighting'): number {
  return template === 'precision' ? PRECISION_TEMPLATE.blackDiameterMm / 2 : SIGHTING_TEMPLATE.zones.standing.solidDiameterMm / 2;
}

/**
 * The result with `characteristics` on every subset: what the group looks like and which potential issues it matches. Prone-only rules
 * run for a prone subset (a `both` target's subsets are judged by their own position, its combined subset by neither).
 */
export function withCharacteristics(result: AnalysisResult, categorization: Categorization, handedness: Handedness): AnalysisResult {
  const disc = discRadiusMm(result.template);
  const one = (subset: SubsetResult): SubsetResult => {
    const position =
      subset.key === 'prone' || subset.key === 'standing'
        ? subset.key
        : categorization.position === 'prone' || categorization.position === 'standing'
          ? categorization.position
          : null;
    return { ...subset, characteristics: characterize(subset.units, { handedness, position, discRadiusMm: disc }) };
  };
  return { ...result, subsets: result.subsets.map(one), all: one(result.all) };
}
