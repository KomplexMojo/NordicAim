// REV-88: attach the observable characteristics to a scored result. Pure.

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '../defaults/templates';
import type { AnalysisResult, SubsetResult } from '../domain/analysis';
import type { Handedness } from '../domain/settings';
import type { Categorization } from '../domain/photo';
import { characterize } from './characteristics';

/**
 * The "miss" radius in mm: the precision black disc (56.2 mm, every position alike), or, for sighting, the zone the
 * shot is judged against — the 22.5 mm prone zone, or the 57.5 mm standing zone (the sighting disc's own outer
 * edge). `null` (position unknown or a `both` target's combined subset) falls back to the prone zone, the tighter
 * and more conservative of the two, matching how the prone-only issue rules already treat an unset position
 * (owner, 2026-09-30: this used to be the standing zone always, which is the same as "off the disc entirely" and
 * so almost never fired).
 */
export function discRadiusMm(template: 'precision' | 'sighting', position: 'prone' | 'standing' | null = null): number {
  if (template === 'precision') return PRECISION_TEMPLATE.blackDiameterMm / 2;
  const zone = position === 'standing' ? SIGHTING_TEMPLATE.zones.standing : SIGHTING_TEMPLATE.zones.prone;
  return zone.solidDiameterMm / 2;
}

/**
 * The result with `characteristics` on every subset: what the group looks like and which potential issues it matches. Prone-only rules
 * run for a prone subset (a `both` target's subsets are judged by their own position, its combined subset by neither).
 */
export function withCharacteristics(result: AnalysisResult, categorization: Categorization, handedness: Handedness): AnalysisResult {
  const one = (subset: SubsetResult): SubsetResult => {
    const position =
      subset.key === 'prone' || subset.key === 'standing'
        ? subset.key
        : categorization.position === 'prone' || categorization.position === 'standing'
          ? categorization.position
          : null;
    return { ...subset, characteristics: characterize(subset.units, { handedness, position, discRadiusMm: discRadiusMm(result.template, position) }) };
  };
  return { ...result, subsets: result.subsets.map(one), all: one(result.all) };
}
