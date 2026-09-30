// REV-88: attach the observable characteristics to a scored result. Pure.

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE, ringRadiusMm } from '../defaults/templates';
import type { AnalysisResult, SubsetResult } from '../domain/analysis';
import type { Handedness } from '../domain/settings';
import type { Categorization } from '../domain/photo';
import { characterize } from './characteristics';

/**
 * The "miss" radius in mm, position-aware:
 * - **Sighting**: the zone the shot is judged against — the 22.5 mm prone zone, or the 57.5 mm standing zone (the
 *   sighting disc's own outer edge).
 * - **Precision**: the physical black disc (56.2 mm) is the same target for both stances, so **standing** still
 *   reads that. **Prone** instead reads **ring 8's radius** (21.2 mm, `ringRadiusMm(8)`) — the precision target has
 *   no prone-specific zone of its own, so this is the ring closest in size to the sighting target's 22.5 mm prone
 *   zone, giving a prone shooter the same "would this count on the tighter target" reading (owner, 2026-09-30).
 *
 * `null` (position unknown, or a `both` target's combined subset) falls back to prone's radius, the tighter and
 * more conservative of the two, matching how the prone-only issue rules already treat an unset position (owner,
 * 2026-09-30: sighting used to always read the standing zone, which is the same as "off the disc entirely" and so
 * almost never fired).
 */
export function discRadiusMm(template: 'precision' | 'sighting', position: 'prone' | 'standing' | null = null): number {
  if (template === 'precision') return position === 'standing' ? PRECISION_TEMPLATE.blackDiameterMm / 2 : ringRadiusMm(8);
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
