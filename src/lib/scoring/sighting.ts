// geometry-scoring.md §5. Sighting-zone scoring for a single unit.

import { SIGHTING_TEMPLATE } from '../defaults/templates';
import type { ShotPosition } from '../domain/enums';
import { EPS } from './precision';

export { EPS };

export type SightingZone = 'clean' | 'hit' | 'miss';

/**
 * `clean` if the hole centre is inside the dotted guide circle (`radialMm <= G`); else `hit` if the
 * hole touches the solid circle (`radialMm - h <= R`, h = holeDiameterMm/2); else `miss`. Inclusive
 * within EPS.
 */
export function zoneFor(radialMm: number, position: ShotPosition, holeDiameterMm: number): SightingZone {
  const zone = SIGHTING_TEMPLATE.zones[position];
  const h = holeDiameterMm / 2;
  const guideRadiusMm = zone.guideDiameterMm / 2;
  const solidRadiusMm = zone.solidDiameterMm / 2;

  if (radialMm <= guideRadiusMm + EPS) return 'clean';
  if (radialMm - h <= solidRadiusMm + EPS) return 'hit';
  return 'miss';
}
