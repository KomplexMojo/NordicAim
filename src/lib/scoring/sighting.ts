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

/**
 * rendering-composite.md §3 item 7a (M24, REV-49): whether a `'hit'` was reached only because the
 * hole's edge touches the solid circle — the unit's centre (`radialMm`) itself lies outside that
 * circle (`solidDiameterMm/2`). `'clean'` and `'miss'` are never touch-credited. Uses the same
 * `SIGHTING_TEMPLATE` radii as `zoneFor`, not a second copy of the thresholds.
 */
export function isTouchCredited(radialMm: number, zone: SightingZone, position: ShotPosition): boolean {
  if (zone !== 'hit') return false;
  const solidRadiusMm = SIGHTING_TEMPLATE.zones[position].solidDiameterMm / 2;
  return radialMm > solidRadiusMm + EPS;
}
